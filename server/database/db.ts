import { eq, desc, and } from 'drizzle-orm';
import { db as drizzleDb, pool } from '../../src/db/index.ts';
import * as schema from '../../src/db/schema.ts';
import { Order, OrderStatus, PrintAgent, PrintFile, AuditLog, PrintSettings } from '../types.ts';

/**
 * Cloud SQL / PostgreSQL persistent database service.
 * Implements atomic updates, SQL locks for concurrent claims, and durable state across Cloud Run container instances.
 */
class CloudSqlDatabase {
  /**
   * Generates atomic public order IDs in the format PS-YYYYMMDD-001
   */
  public async generatePublicOrderId(): Promise<string> {
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          `INSERT INTO daily_sequences (date_str, next_seq)
           VALUES ($1, 2)
           ON CONFLICT (date_str)
           DO UPDATE SET next_seq = daily_sequences.next_seq + 1
           RETURNING next_seq - 1 AS current_seq;`,
          [today]
        );
        await client.query('COMMIT');
        const seq = res.rows[0].current_seq;
        const formatted = String(seq).padStart(3, '0');
        return `PS-${today}-${formatted}`;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('[DB] Error generating atomic public order ID:', e);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSeq = Math.floor(100 + Math.random() * 900);
      return `PS-${today}-${randomSeq}`;
    }
  }

  /**
   * Retrieves all orders with their attached files, sorted newest first
   */
  public async getOrders(statusFilter?: string): Promise<Order[]> {
    try {
      const orderRows = await drizzleDb.query.orders.findMany({
        where: statusFilter && statusFilter !== 'ALL' ? eq(schema.orders.status, statusFilter) : undefined,
        orderBy: [desc(schema.orders.createdAt)],
        with: {
          files: true,
        },
      });

      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error('[DB] Failed to query orders from Cloud SQL:', error);
      throw new Error('Database query failed while fetching orders.', { cause: error });
    }
  }

  public async getOrderById(id: string): Promise<Order | null> {
    try {
      const orderRow = await drizzleDb.query.orders.findFirst({
        where: eq(schema.orders.id, id),
        with: {
          files: true,
        },
      });

      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query order ${id}:`, error);
      throw new Error(`Database query failed for order ${id}`, { cause: error });
    }
  }

  public async getOrderByPublicId(publicOrderId: string): Promise<Order | null> {
    try {
      const cleaned = publicOrderId.trim().toUpperCase();
      const orderRow = await drizzleDb.query.orders.findFirst({
        where: eq(schema.orders.publicOrderId, cleaned),
        with: {
          files: true,
        },
      });

      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query public order ${publicOrderId}:`, error);
      throw new Error(`Database query failed for public order ${publicOrderId}`, { cause: error });
    }
  }

  public async saveOrder(order: Order): Promise<Order> {
    try {
      // Upsert order record
      await drizzleDb
        .insert(schema.orders)
        .values({
          id: order.id,
          publicOrderId: order.publicOrderId,
          status: order.status,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerNotes: order.customerNotes,
          rejectionReason: order.rejectionReason,
          failureReason: order.failureReason,
          totalFiles: order.totalFiles,
          claimedByAgent: order.claimedByAgent || null,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt),
        })
        .onConflictDoUpdate({
          target: schema.orders.id,
          set: {
            status: order.status,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerNotes: order.customerNotes,
            rejectionReason: order.rejectionReason,
            failureReason: order.failureReason,
            totalFiles: order.totalFiles,
            claimedByAgent: order.claimedByAgent || null,
            updatedAt: new Date(order.updatedAt),
          },
        });

      // Upsert files
      if (order.files && order.files.length > 0) {
        for (const file of order.files) {
          await drizzleDb
            .insert(schema.files)
            .values({
              id: file.id,
              orderId: order.id,
              originalFilename: file.originalFilename,
              storageFilename: file.storageFilename,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              fileSizeBytes: file.fileSizeBytes,
              pageCount: file.pageCount || 1,
              printSettings: file.printSettings,
              createdAt: new Date(file.createdAt),
            })
            .onConflictDoUpdate({
              target: schema.files.id,
              set: {
                originalFilename: file.originalFilename,
                storageFilename: file.storageFilename,
                storagePath: file.storagePath,
                mimeType: file.mimeType,
                fileSizeBytes: file.fileSizeBytes,
                pageCount: file.pageCount || 1,
                printSettings: file.printSettings,
              },
            });
        }
      }

      return order;
    } catch (error) {
      console.error('[DB] Failed to save order in Cloud SQL:', error);
      throw new Error('Database query failed while saving order.', { cause: error });
    }
  }

  public async getApprovedOrders(): Promise<Order[]> {
    try {
      const orderRows = await drizzleDb.query.orders.findMany({
        where: eq(schema.orders.status, 'APPROVED'),
        orderBy: [desc(schema.orders.createdAt)],
        with: {
          files: true,
        },
      });

      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error('[DB] Failed to fetch approved orders:', error);
      throw new Error('Database query failed while fetching approved jobs.', { cause: error });
    }
  }

  /**
   * ATOMIC JOB CLAIMING
   * Uses SQL atomic condition UPDATE ... WHERE id = $1 AND status = 'APPROVED'
   * If two agents attempt to claim simultaneously, exactly one succeeds and the other gets rowCount = 0.
   */
  public async claimApprovedOrder(orderId: string, agentId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const now = new Date();
      // Atomic conditional update
      const updateRes = await client.query(
        `UPDATE orders
         SET status = 'CLAIMED',
             claimed_by_agent = $1,
             updated_at = $2
         WHERE id = $3 AND status = 'APPROVED'
         RETURNING id;`,
        [agentId, now, orderId]
      );

      if (updateRes.rowCount === 0) {
        // Job was already claimed or was not in APPROVED state
        await client.query('ROLLBACK');
        return false;
      }

      // Record audit log atomically
      const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await client.query(
        `INSERT INTO audit_logs (id, order_id, previous_status, new_status, actor_type, actor_id, message, created_at)
         VALUES ($1, $2, 'APPROVED', 'CLAIMED', 'PRINT_AGENT', $3, $4, $5);`,
        [
          auditId,
          orderId,
          agentId,
          `Order atomically claimed by Print Agent ${agentId}`,
          now,
        ]
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[DB] Error during atomic claim for order ${orderId}:`, err);
      return false;
    } finally {
      client.release();
    }
  }

  // --- AGENT TELEMETRY & PERSISTENCE ---

  public async getAgent(agentId: string): Promise<PrintAgent | null> {
    try {
      const agentRow = await drizzleDb.query.agents.findFirst({
        where: eq(schema.agents.id, agentId),
      });

      if (!agentRow) return null;
      return this.mapAgentRow(agentRow);
    } catch (error) {
      console.error(`[DB] Failed to query agent ${agentId}:`, error);
      throw new Error(`Database query failed for agent ${agentId}`, { cause: error });
    }
  }

  public async getAllAgents(): Promise<PrintAgent[]> {
    try {
      const agentRows = await drizzleDb.query.agents.findMany({
        orderBy: [schema.agents.id],
      });

      return agentRows.map((r) => this.mapAgentRow(r));
    } catch (error) {
      console.error('[DB] Failed to query all agents:', error);
      throw new Error('Database query failed while fetching agents.', { cause: error });
    }
  }

  public async saveAgent(agent: PrintAgent): Promise<PrintAgent> {
    try {
      await drizzleDb
        .insert(schema.agents)
        .values({
          id: agent.id,
          name: agent.name,
          token: agent.token,
          configuredPrinter: agent.configuredPrinter,
          isActive: agent.isActive,
          lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
          currentStatus: agent.currentStatus,
          printMode: agent.printMode || 'windows',
          systemInfo: agent.systemInfo || null,
          createdAt: new Date(agent.createdAt),
          updatedAt: new Date(agent.updatedAt),
        })
        .onConflictDoUpdate({
          target: schema.agents.id,
          set: {
            name: agent.name,
            token: agent.token,
            configuredPrinter: agent.configuredPrinter,
            isActive: agent.isActive,
            lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
            currentStatus: agent.currentStatus,
            printMode: agent.printMode || 'windows',
            systemInfo: agent.systemInfo || null,
            updatedAt: new Date(agent.updatedAt),
          },
        });

      return agent;
    } catch (error) {
      console.error('[DB] Failed to persist agent in Cloud SQL:', error);
      throw new Error('Database query failed while saving agent.', { cause: error });
    }
  }

  // --- AUDIT LOGS ---

  public async logAudit(log: AuditLog): Promise<void> {
    try {
      await drizzleDb.insert(schema.auditLogs).values({
        id: log.id,
        orderId: log.orderId,
        previousStatus: log.previousStatus || null,
        newStatus: log.newStatus,
        actorType: log.actorType,
        actorId: log.actorId || null,
        message: log.message || null,
        createdAt: new Date(log.createdAt),
      });
    } catch (error) {
      console.warn('[DB] Could not write audit log to Cloud SQL:', error);
    }
  }

  public async getAuditLogs(orderId?: string): Promise<AuditLog[]> {
    try {
      const logs = await drizzleDb.query.auditLogs.findMany({
        where: orderId ? eq(schema.auditLogs.orderId, orderId) : undefined,
        orderBy: [desc(schema.auditLogs.createdAt)],
        limit: 1000,
      });

      return logs.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        previousStatus: (l.previousStatus as OrderStatus) || undefined,
        newStatus: l.newStatus as OrderStatus,
        actorType: l.actorType as any,
        actorId: l.actorId || undefined,
        message: l.message || undefined,
        createdAt: l.createdAt.toISOString(),
      }));
    } catch (error) {
      console.error('[DB] Failed to get audit logs:', error);
      return [];
    }
  }

  // --- ROW MAPPERS ---

  private mapOrderRow(r: typeof schema.orders.$inferSelect, fileRows?: (typeof schema.files.$inferSelect)[]): Order {
    return {
      id: r.id,
      publicOrderId: r.publicOrderId,
      status: r.status as OrderStatus,
      customerName: r.customerName || undefined,
      customerPhone: r.customerPhone || undefined,
      customerNotes: r.customerNotes || undefined,
      rejectionReason: r.rejectionReason || undefined,
      failureReason: r.failureReason || undefined,
      totalFiles: r.totalFiles,
      claimedByAgent: r.claimedByAgent || undefined,
      files: (fileRows || []).map((f) => ({
        id: f.id,
        orderId: f.orderId,
        originalFilename: f.originalFilename,
        storageFilename: f.storageFilename,
        storagePath: f.storagePath,
        mimeType: f.mimeType,
        fileSizeBytes: f.fileSizeBytes,
        pageCount: f.pageCount,
        printSettings: f.printSettings as PrintSettings,
        createdAt: f.createdAt.toISOString(),
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private mapAgentRow(r: typeof schema.agents.$inferSelect): PrintAgent {
    return {
      id: r.id,
      name: r.name,
      token: r.token,
      configuredPrinter: r.configuredPrinter,
      isActive: r.isActive,
      lastHeartbeatAt: r.lastHeartbeatAt ? r.lastHeartbeatAt.toISOString() : undefined,
      currentStatus: r.currentStatus as any,
      printMode: (r.printMode as any) || 'windows',
      systemInfo: (r.systemInfo as any) || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

export const db = new CloudSqlDatabase();
