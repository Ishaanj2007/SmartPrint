import fs from 'fs';
import path from 'path';
import { Order, OrderStatus, PrintAgent, PrintFile, AuditLog } from '../types.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

interface DatabaseSchema {
  orders: Record<string, Order>;
  agents: Record<string, PrintAgent>;
  auditLogs: AuditLog[];
  nextDailySequence: Record<string, number>; // dateStr -> number for PS-YYYYMMDD-XXX
}

class Database {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  // Mutex lock for atomic job claiming
  private claimingLock = false;

  constructor() {
    this.data = {
      orders: {},
      agents: {},
      auditLogs: [],
      nextDailySequence: {},
    };
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.seedDefaults();
        this.saveImmediately();
      }
    } catch (e) {
      console.warn('[DB] Failed to load db.json, using fresh store:', e);
      this.seedDefaults();
    }
  }

  private seedDefaults() {
    // Seed default shop agent
    const defaultAgent: PrintAgent = {
      id: 'SHOP_001',
      name: 'Counter Main Windows PC',
      token: 'agent_secret_token_123',
      configuredPrinter: 'DEFAULT',
      isActive: true,
      lastHeartbeatAt: new Date(Date.now() - 5000).toISOString(),
      currentStatus: 'IDLE',
      printMode: 'windows',
      systemInfo: {
        os: 'Windows 11 Pro',
        printer: 'EPSON L3150 Series',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.agents[defaultAgent.id] = defaultAgent;

    // Seed a sample completed order and a sample pending order for instant preview
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sampleId1 = 'sample-ord-001';
    const samplePublicId1 = `PS-${today}-001`;

    this.data.orders[sampleId1] = {
      id: sampleId1,
      publicOrderId: samplePublicId1,
      status: 'PENDING',
      customerName: 'Alex Customer',
      customerPhone: '+1-555-0199',
      customerNotes: 'Please print color on A4 single-sided. 2 copies.',
      totalFiles: 1,
      files: [
        {
          id: 'file-sample-001',
          orderId: sampleId1,
          originalFilename: 'project_presentation.pdf',
          storageFilename: 'sample_project_presentation.pdf',
          storagePath: 'sample_project_presentation.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 245600,
          pageCount: 6,
          printSettings: {
            paperSize: 'A4',
            colorMode: 'COLOR',
            sides: 'SINGLE',
            copies: 2,
            pageRange: 'ALL',
          },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    };
    this.data.nextDailySequence[today] = 2;
  }

  public scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveImmediately();
      this.saveTimeout = null;
    }, 400);
  }

  private saveImmediately() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] Error persisting db.json:', e);
    }
  }

  // --- ORDER METHODS ---

  public generatePublicOrderId(): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const currentSeq = this.data.nextDailySequence[today] || 1;
    this.data.nextDailySequence[today] = currentSeq + 1;
    this.scheduleSave();
    const formatted = String(currentSeq).padStart(3, '0');
    return `PS-${today}-${formatted}`;
  }

  public getOrders(): Order[] {
    return Object.values(this.data.orders).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getOrderById(id: string): Order | undefined {
    return this.data.orders[id];
  }

  public getOrderByPublicId(publicOrderId: string): Order | undefined {
    const cleaned = publicOrderId.trim().toUpperCase();
    return Object.values(this.data.orders).find(
      (o) => o.publicOrderId.toUpperCase() === cleaned
    );
  }

  public saveOrder(order: Order): Order {
    this.data.orders[order.id] = order;
    this.scheduleSave();
    return order;
  }

  public getApprovedOrders(): Order[] {
    return Object.values(this.data.orders).filter((o) => o.status === 'APPROVED');
  }

  /**
   * ATOMIC JOB CLAIMING
   * Ensures only ONE agent can claim an approved order.
   * If two agents attempt to claim simultaneously, exactly one succeeds.
   */
  public async claimApprovedOrder(orderId: string, agentId: string): Promise<boolean> {
    // Acquire lock
    while (this.claimingLock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.claimingLock = true;

    try {
      const order = this.data.orders[orderId];
      if (!order || order.status !== 'APPROVED') {
        return false;
      }

      // Transition to CLAIMED
      order.status = 'CLAIMED';
      order.claimedByAgent = agentId;
      order.updatedAt = new Date().toISOString();

      this.logAudit({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        orderId,
        previousStatus: 'APPROVED',
        newStatus: 'CLAIMED',
        actorType: 'PRINT_AGENT',
        actorId: agentId,
        message: `Order atomically claimed by Print Agent ${agentId}`,
        createdAt: new Date().toISOString(),
      });

      this.scheduleSave();
      return true;
    } finally {
      this.claimingLock = false;
    }
  }

  // --- AGENT METHODS ---

  public getAgent(agentId: string): PrintAgent | undefined {
    return this.data.agents[agentId];
  }

  public getAllAgents(): PrintAgent[] {
    return Object.values(this.data.agents);
  }

  public saveAgent(agent: PrintAgent): PrintAgent {
    this.data.agents[agent.id] = agent;
    this.scheduleSave();
    return agent;
  }

  // --- AUDIT LOGS ---

  public logAudit(log: AuditLog) {
    this.data.auditLogs.push(log);
    // Keep last 1000 logs
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(-1000);
    }
    this.scheduleSave();
  }

  public getAuditLogs(orderId?: string): AuditLog[] {
    if (!orderId) return this.data.auditLogs;
    return this.data.auditLogs.filter((l) => l.orderId === orderId);
  }
}

export const db = new Database();
