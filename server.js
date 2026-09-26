var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server.ts
import express from "express";
import cors from "cors";
import path3 from "path";
import fs3 from "fs";

// server/routes/orderRoutes.ts
import { Router } from "express";
import multer from "multer";

// server/services/orderService.ts
import crypto from "crypto";

// server/database/db.ts
import { eq, desc } from "drizzle-orm";

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  agents: () => agents,
  auditLogs: () => auditLogs,
  dailySequences: () => dailySequences,
  files: () => files,
  filesRelations: () => filesRelations,
  orders: () => orders,
  ordersRelations: () => ordersRelations,
  users: () => users
});
import { pgTable, text, timestamp, boolean, integer, jsonb, serial } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  // Firebase Auth UID
  email: text("email").notNull(),
  role: text("role").default("USER"),
  // 'ADMIN' or 'USER'
  createdAt: timestamp("created_at").defaultNow()
});
var agents = pgTable("agents", {
  id: text("id").primaryKey(),
  // e.g. 'SHOP_001'
  name: text("name").notNull(),
  // 'Counter Main Windows PC'
  token: text("token").notNull(),
  // 'agent_secret_token_123'
  configuredPrinter: text("configured_printer").notNull(),
  // 'EPSON L8050 Series'
  isActive: boolean("is_active").default(true).notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  currentStatus: text("current_status").default("IDLE").notNull(),
  // 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE'
  printMode: text("print_mode").default("windows"),
  // 'windows' | 'mock'
  systemInfo: jsonb("system_info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var orders = pgTable("orders", {
  id: text("id").primaryKey(),
  // e.g. 'ord-123456789'
  publicOrderId: text("public_order_id").notNull().unique(),
  // e.g. 'PS-20260926-001'
  status: text("status").default("PENDING").notNull(),
  // 'PENDING' | 'APPROVED' | 'CLAIMED' | 'PRINTING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'CANCELLED'
  customerName: text("customer_name").default("Walk-in Customer"),
  customerPhone: text("customer_phone").default(""),
  customerNotes: text("customer_notes").default(""),
  rejectionReason: text("rejection_reason"),
  failureReason: text("failure_reason"),
  totalFiles: integer("total_files").default(1).notNull(),
  claimedByAgent: text("claimed_by_agent").references(() => agents.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var files = pgTable("files", {
  id: text("id").primaryKey(),
  // e.g. 'file-123'
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  storageFilename: text("storage_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  pageCount: integer("page_count").default(1).notNull(),
  printSettings: jsonb("print_settings").notNull(),
  // { paperSize, colorMode, sides, copies, pageRange }
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  actorType: text("actor_type").notNull(),
  // 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM'
  actorId: text("actor_id"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var dailySequences = pgTable("daily_sequences", {
  dateStr: text("date_str").primaryKey(),
  // e.g. '20260926'
  nextSeq: integer("next_seq").default(1).notNull()
});
var ordersRelations = relations(orders, ({ many, one }) => ({
  files: many(files),
  agent: one(agents, {
    fields: [orders.claimedByAgent],
    references: [agents.id]
  })
}));
var filesRelations = relations(files, ({ one }) => ({
  order: one(orders, {
    fields: [files.orderId],
    references: [orders.id]
  })
}));

// src/db/index.ts
var createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15e3
    });
    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }
  return global._postgresPool;
};
var pool = createPool();
var db = drizzle(pool, { schema: schema_exports });

// server/database/db.ts
var CloudSqlDatabase = class {
  /**
   * Generates atomic public order IDs in the format PS-YYYYMMDD-001
   */
  async generatePublicOrderId() {
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          `INSERT INTO daily_sequences (date_str, next_seq)
           VALUES ($1, 2)
           ON CONFLICT (date_str)
           DO UPDATE SET next_seq = daily_sequences.next_seq + 1
           RETURNING next_seq - 1 AS current_seq;`,
          [today]
        );
        await client.query("COMMIT");
        const seq = res.rows[0].current_seq;
        const formatted = String(seq).padStart(3, "0");
        return `PS-${today}-${formatted}`;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("[DB] Error generating atomic public order ID:", e);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
      const randomSeq = Math.floor(100 + Math.random() * 900);
      return `PS-${today}-${randomSeq}`;
    }
  }
  /**
   * Retrieves all orders with their attached files, sorted newest first
   */
  async getOrders(statusFilter) {
    try {
      const orderRows = await db.query.orders.findMany({
        where: statusFilter && statusFilter !== "ALL" ? eq(orders.status, statusFilter) : void 0,
        orderBy: [desc(orders.createdAt)],
        with: {
          files: true
        }
      });
      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error("[DB] Failed to query orders from Cloud SQL:", error);
      throw new Error("Database query failed while fetching orders.", { cause: error });
    }
  }
  async getOrderById(id) {
    try {
      const orderRow = await db.query.orders.findFirst({
        where: eq(orders.id, id),
        with: {
          files: true
        }
      });
      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query order ${id}:`, error);
      throw new Error(`Database query failed for order ${id}`, { cause: error });
    }
  }
  async getOrderByPublicId(publicOrderId) {
    try {
      const cleaned = publicOrderId.trim().toUpperCase();
      const orderRow = await db.query.orders.findFirst({
        where: eq(orders.publicOrderId, cleaned),
        with: {
          files: true
        }
      });
      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query public order ${publicOrderId}:`, error);
      throw new Error(`Database query failed for public order ${publicOrderId}`, { cause: error });
    }
  }
  async saveOrder(order) {
    try {
      await db.insert(orders).values({
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
        updatedAt: new Date(order.updatedAt)
      }).onConflictDoUpdate({
        target: orders.id,
        set: {
          status: order.status,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerNotes: order.customerNotes,
          rejectionReason: order.rejectionReason,
          failureReason: order.failureReason,
          totalFiles: order.totalFiles,
          claimedByAgent: order.claimedByAgent || null,
          updatedAt: new Date(order.updatedAt)
        }
      });
      if (order.files && order.files.length > 0) {
        for (const file of order.files) {
          await db.insert(files).values({
            id: file.id,
            orderId: order.id,
            originalFilename: file.originalFilename,
            storageFilename: file.storageFilename,
            storagePath: file.storagePath,
            mimeType: file.mimeType,
            fileSizeBytes: file.fileSizeBytes,
            pageCount: file.pageCount || 1,
            printSettings: file.printSettings,
            createdAt: new Date(file.createdAt)
          }).onConflictDoUpdate({
            target: files.id,
            set: {
              originalFilename: file.originalFilename,
              storageFilename: file.storageFilename,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              fileSizeBytes: file.fileSizeBytes,
              pageCount: file.pageCount || 1,
              printSettings: file.printSettings
            }
          });
        }
      }
      return order;
    } catch (error) {
      console.error("[DB] Failed to save order in Cloud SQL:", error);
      throw new Error("Database query failed while saving order.", { cause: error });
    }
  }
  async getApprovedOrders() {
    try {
      const orderRows = await db.query.orders.findMany({
        where: eq(orders.status, "APPROVED"),
        orderBy: [desc(orders.createdAt)],
        with: {
          files: true
        }
      });
      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error("[DB] Failed to fetch approved orders:", error);
      throw new Error("Database query failed while fetching approved jobs.", { cause: error });
    }
  }
  /**
   * ATOMIC JOB CLAIMING
   * Uses SQL atomic condition UPDATE ... WHERE id = $1 AND status = 'APPROVED'
   * If two agents attempt to claim simultaneously, exactly one succeeds and the other gets rowCount = 0.
   */
  async claimApprovedOrder(orderId, agentId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const now = /* @__PURE__ */ new Date();
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
        await client.query("ROLLBACK");
        return false;
      }
      const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await client.query(
        `INSERT INTO audit_logs (id, order_id, previous_status, new_status, actor_type, actor_id, message, created_at)
         VALUES ($1, $2, 'APPROVED', 'CLAIMED', 'PRINT_AGENT', $3, $4, $5);`,
        [
          auditId,
          orderId,
          agentId,
          `Order atomically claimed by Print Agent ${agentId}`,
          now
        ]
      );
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[DB] Error during atomic claim for order ${orderId}:`, err);
      return false;
    } finally {
      client.release();
    }
  }
  // --- AGENT TELEMETRY & PERSISTENCE ---
  async getAgent(agentId) {
    try {
      const agentRow = await db.query.agents.findFirst({
        where: eq(agents.id, agentId)
      });
      if (!agentRow) return null;
      return this.mapAgentRow(agentRow);
    } catch (error) {
      console.error(`[DB] Failed to query agent ${agentId}:`, error);
      throw new Error(`Database query failed for agent ${agentId}`, { cause: error });
    }
  }
  async getAllAgents() {
    try {
      const agentRows = await db.query.agents.findMany({
        orderBy: [agents.id]
      });
      return agentRows.map((r) => this.mapAgentRow(r));
    } catch (error) {
      console.error("[DB] Failed to query all agents:", error);
      throw new Error("Database query failed while fetching agents.", { cause: error });
    }
  }
  async saveAgent(agent) {
    try {
      await db.insert(agents).values({
        id: agent.id,
        name: agent.name,
        token: agent.token,
        configuredPrinter: agent.configuredPrinter,
        isActive: agent.isActive,
        lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
        currentStatus: agent.currentStatus,
        printMode: agent.printMode || "windows",
        systemInfo: agent.systemInfo || null,
        createdAt: new Date(agent.createdAt),
        updatedAt: new Date(agent.updatedAt)
      }).onConflictDoUpdate({
        target: agents.id,
        set: {
          name: agent.name,
          token: agent.token,
          configuredPrinter: agent.configuredPrinter,
          isActive: agent.isActive,
          lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
          currentStatus: agent.currentStatus,
          printMode: agent.printMode || "windows",
          systemInfo: agent.systemInfo || null,
          updatedAt: new Date(agent.updatedAt)
        }
      });
      return agent;
    } catch (error) {
      console.error("[DB] Failed to persist agent in Cloud SQL:", error);
      throw new Error("Database query failed while saving agent.", { cause: error });
    }
  }
  // --- AUDIT LOGS ---
  async logAudit(log) {
    try {
      await db.insert(auditLogs).values({
        id: log.id,
        orderId: log.orderId,
        previousStatus: log.previousStatus || null,
        newStatus: log.newStatus,
        actorType: log.actorType,
        actorId: log.actorId || null,
        message: log.message || null,
        createdAt: new Date(log.createdAt)
      });
    } catch (error) {
      console.warn("[DB] Could not write audit log to Cloud SQL:", error);
    }
  }
  async getAuditLogs(orderId) {
    try {
      const logs = await db.query.auditLogs.findMany({
        where: orderId ? eq(auditLogs.orderId, orderId) : void 0,
        orderBy: [desc(auditLogs.createdAt)],
        limit: 1e3
      });
      return logs.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        previousStatus: l.previousStatus || void 0,
        newStatus: l.newStatus,
        actorType: l.actorType,
        actorId: l.actorId || void 0,
        message: l.message || void 0,
        createdAt: l.createdAt.toISOString()
      }));
    } catch (error) {
      console.error("[DB] Failed to get audit logs:", error);
      return [];
    }
  }
  // --- ROW MAPPERS ---
  mapOrderRow(r, fileRows) {
    return {
      id: r.id,
      publicOrderId: r.publicOrderId,
      status: r.status,
      customerName: r.customerName || void 0,
      customerPhone: r.customerPhone || void 0,
      customerNotes: r.customerNotes || void 0,
      rejectionReason: r.rejectionReason || void 0,
      failureReason: r.failureReason || void 0,
      totalFiles: r.totalFiles,
      claimedByAgent: r.claimedByAgent || void 0,
      files: (fileRows || []).map((f) => ({
        id: f.id,
        orderId: f.orderId,
        originalFilename: f.originalFilename,
        storageFilename: f.storageFilename,
        storagePath: f.storagePath,
        mimeType: f.mimeType,
        fileSizeBytes: f.fileSizeBytes,
        pageCount: f.pageCount,
        printSettings: f.printSettings,
        createdAt: f.createdAt.toISOString()
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
  mapAgentRow(r) {
    return {
      id: r.id,
      name: r.name,
      token: r.token,
      configuredPrinter: r.configuredPrinter,
      isActive: r.isActive,
      lastHeartbeatAt: r.lastHeartbeatAt ? r.lastHeartbeatAt.toISOString() : void 0,
      currentStatus: r.currentStatus,
      printMode: r.printMode || "windows",
      systemInfo: r.systemInfo || void 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
};
var db2 = new CloudSqlDatabase();

// server/services/orderService.ts
var OrderService = class {
  static async createOrder(input) {
    const orderId = `ord-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const publicOrderId = await db2.generatePublicOrderId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const printFiles = input.files.map((f, index) => ({
      id: `file-${Date.now()}-${index}-${crypto.randomBytes(3).toString("hex")}`,
      orderId,
      originalFilename: f.originalFilename,
      storageFilename: f.storageFilename,
      storagePath: f.storagePath,
      mimeType: f.mimeType,
      fileSizeBytes: f.fileSizeBytes,
      pageCount: f.pageCount || 1,
      printSettings: f.printSettings,
      createdAt: now
    }));
    const order = {
      id: orderId,
      publicOrderId,
      status: "PENDING",
      customerName: input.customerName || "Walk-in Customer",
      customerPhone: input.customerPhone || "",
      customerNotes: input.customerNotes || "",
      totalFiles: printFiles.length,
      files: printFiles,
      createdAt: now,
      updatedAt: now
    };
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: void 0,
      newStatus: "PENDING",
      actorType: "CUSTOMER",
      message: `Order submitted by customer with ${printFiles.length} file(s)`,
      createdAt: now
    });
    return order;
  }
  static async getOrderByPublicId(publicOrderId) {
    return await db2.getOrderByPublicId(publicOrderId);
  }
  static async getOrderById(id) {
    return await db2.getOrderById(id);
  }
  static async getOrders(statusFilter) {
    return await db2.getOrders(statusFilter);
  }
  static async approveOrder(orderId, adminId = "admin") {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    if (order.status !== "PENDING" && order.status !== "REJECTED") {
      throw new Error(`Cannot approve order in status '${order.status}'. Only PENDING or REJECTED orders can be approved.`);
    }
    const prev = order.status;
    order.status = "APPROVED";
    order.rejectionReason = void 0;
    order.failureReason = void 0;
    order.claimedByAgent = void 0;
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "APPROVED",
      actorType: "ADMIN",
      actorId: adminId,
      message: "Order approved by shopkeeper. Made available to Print Agent.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
  static async rejectOrder(orderId, reason, adminId = "admin") {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "REJECTED";
    order.rejectionReason = reason || "Declined by shop administrator";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "REJECTED",
      actorType: "ADMIN",
      actorId: adminId,
      message: `Order rejected: ${order.rejectionReason}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
  static async retryFailedOrder(orderId, adminId = "admin") {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    if (order.status !== "FAILED") {
      throw new Error(`Only FAILED orders can be retried.`);
    }
    const prev = order.status;
    order.status = "APPROVED";
    order.failureReason = void 0;
    order.claimedByAgent = void 0;
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "APPROVED",
      actorType: "ADMIN",
      actorId: adminId,
      message: "Failed print order reset to APPROVED for retry",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
};

// server/storage/storage.ts
import fs from "fs";
import path from "path";
import crypto2 from "crypto";
var UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
var ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png"
]);
var MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
var StorageService = class {
  /**
   * Validates file metadata before processing.
   */
  static validateFile(mimeType, sizeBytes) {
    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported file format '${mimeType}'. Allowed formats: PDF, JPG, PNG.`
      };
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File exceeds maximum limit of 20 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB).`
      };
    }
    return { valid: true };
  }
  /**
   * Saves a buffer to disk using a cryptographically randomized filename.
   */
  static saveBuffer(originalName, mimeType, buffer) {
    const ext = path.extname(originalName) || (mimeType === "application/pdf" ? ".pdf" : ".jpg");
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const randomHex = crypto2.randomBytes(16).toString("hex");
    const storageFilename = `${Date.now()}_${randomHex}${cleanExt}`;
    const storagePath = path.join(UPLOAD_DIR, storageFilename);
    fs.writeFileSync(storagePath, buffer);
    return {
      originalFilename: path.basename(originalName).slice(0, 200),
      storageFilename,
      storagePath,
      mimeType,
      fileSizeBytes: buffer.length
    };
  }
  /**
   * Resolves the absolute file path for a storageFilename.
   * Prevents directory traversal attacks.
   */
  static resolveFilePath(storageFilename) {
    const safeName = path.basename(storageFilename);
    const fullPath = path.join(UPLOAD_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fullPath;
  }
  /**
   * Deletes a file from disk.
   */
  static deleteFile(storageFilename) {
    try {
      const fullPath = this.resolveFilePath(storageFilename);
      if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
    } catch (e) {
      console.warn(`[STORAGE] Could not delete file ${storageFilename}:`, e);
    }
    return false;
  }
};

// server/controllers/orderController.ts
var OrderController = class {
  static async createOrder(req, res) {
    try {
      const { customerName, customerPhone, customerNotes, defaultSettings } = req.body;
      const uploadedFiles = req.files;
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: "Please upload at least one document." });
        return;
      }
      let parsedSettings = {
        paperSize: "A4",
        colorMode: "BW",
        sides: "SINGLE",
        copies: 1,
        pageRange: "ALL"
      };
      if (defaultSettings) {
        try {
          parsedSettings = typeof defaultSettings === "string" ? JSON.parse(defaultSettings) : defaultSettings;
        } catch (e) {
        }
      }
      const filesToProcess = [];
      for (const file of uploadedFiles) {
        const validation = StorageService.validateFile(file.mimetype, file.size);
        if (!validation.valid) {
          res.status(400).json({ error: validation.error });
          return;
        }
        const stored = StorageService.saveBuffer(file.originalname, file.mimetype, file.buffer);
        filesToProcess.push({
          originalFilename: stored.originalFilename,
          storageFilename: stored.storageFilename,
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          fileSizeBytes: stored.fileSizeBytes,
          pageCount: 1,
          printSettings: parsedSettings
        });
      }
      const newOrder = await OrderService.createOrder({
        customerName,
        customerPhone,
        customerNotes,
        files: filesToProcess
      });
      res.status(201).json({
        success: true,
        orderId: newOrder.id,
        publicOrderId: newOrder.publicOrderId,
        status: newOrder.status,
        order: newOrder
      });
    } catch (error) {
      console.error("[ORDER] Error creating order:", error);
      res.status(500).json({ error: error.message || "Failed to submit order" });
    }
  }
  static async getOrderStatus(req, res) {
    try {
      const { publicOrderId } = req.params;
      const order = await OrderService.getOrderByPublicId(publicOrderId) || await OrderService.getOrderById(publicOrderId);
      if (!order) {
        res.status(404).json({ error: `Order '${publicOrderId}' not found.` });
        return;
      }
      res.json({
        success: true,
        order: {
          id: order.id,
          publicOrderId: order.publicOrderId,
          status: order.status,
          customerName: order.customerName,
          totalFiles: order.totalFiles,
          files: order.files.map((f) => ({
            id: f.id,
            originalFilename: f.originalFilename,
            fileSizeBytes: f.fileSizeBytes,
            mimeType: f.mimeType,
            printSettings: f.printSettings
          })),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getFile(req, res) {
    try {
      const { orderId, fileId } = req.params;
      const order = await OrderService.getOrderById(orderId);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const filePath = StorageService.resolveFilePath(file.storageFilename);
      if (!filePath) {
        res.status(404).json({ error: "File data missing" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/routes/orderRoutes.ts
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10
  }
});
var orderRoutes = Router();
orderRoutes.post("/", upload.array("files", 10), OrderController.createOrder);
orderRoutes.get("/:publicOrderId", OrderController.getOrderStatus);
orderRoutes.get("/:orderId/files/:fileId", OrderController.getFile);

// server/routes/adminRoutes.ts
import { Router as Router2 } from "express";

// server/auth/adminAuth.ts
var ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "xerox123";
var ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin_session_secret_token_8899";
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const sessionToken = req.headers["x-admin-token"];
  const token = sessionToken || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (token === ADMIN_TOKEN) {
    next();
    return;
  }
  res.status(401).json({
    error: "Unauthorized: Admin authentication required."
  });
}

// server/controllers/adminController.ts
var AdminController = class {
  static async login(req, res) {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      res.json({
        success: true,
        token: ADMIN_TOKEN,
        user: {
          username: ADMIN_USERNAME,
          role: "ADMIN"
        }
      });
      return;
    }
    res.status(401).json({
      error: "Invalid admin username or password."
    });
  }
  static async getOrders(req, res) {
    try {
      const status = req.query.status;
      const orders2 = await OrderService.getOrders(status);
      const allOrders = await OrderService.getOrders();
      const counts = {
        ALL: allOrders.length,
        PENDING: allOrders.filter((o) => o.status === "PENDING").length,
        APPROVED: allOrders.filter((o) => o.status === "APPROVED").length,
        CLAIMED: allOrders.filter((o) => o.status === "CLAIMED").length,
        PRINTING: allOrders.filter((o) => o.status === "PRINTING").length,
        COMPLETED: allOrders.filter((o) => o.status === "COMPLETED").length,
        REJECTED: allOrders.filter((o) => o.status === "REJECTED").length,
        FAILED: allOrders.filter((o) => o.status === "FAILED").length
      };
      res.json({
        success: true,
        counts,
        orders: orders2
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getOrderDetails(req, res) {
    try {
      const { id } = req.params;
      const order = await OrderService.getOrderById(id) || await OrderService.getOrderByPublicId(id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const auditLogs2 = await db2.getAuditLogs(order.id);
      res.json({
        success: true,
        order,
        auditLogs: auditLogs2
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async approveOrder(req, res) {
    try {
      const { id } = req.params;
      const updated = await OrderService.approveOrder(id);
      res.json({
        success: true,
        message: "Order approved successfully. Ready for Print Agent.",
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async rejectOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const updated = await OrderService.rejectOrder(id, reason || "Rejected by shop admin");
      res.json({
        success: true,
        message: "Order rejected.",
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async retryOrder(req, res) {
    try {
      const { id } = req.params;
      const updated = await OrderService.retryFailedOrder(id);
      res.json({
        success: true,
        message: "Order reset to APPROVED for printing retry.",
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async getAgents(req, res) {
    try {
      const agentList = await db2.getAllAgents();
      const agents2 = agentList.map((agent) => {
        const lastSeen = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).getTime() : 0;
        const diffSeconds = Math.round((Date.now() - lastSeen) / 1e3);
        const isOnline = diffSeconds <= 30;
        return {
          id: agent.id,
          name: agent.name,
          configuredPrinter: agent.configuredPrinter,
          lastHeartbeatAt: agent.lastHeartbeatAt,
          secondsSinceHeartbeat: diffSeconds,
          isOnline,
          currentStatus: isOnline ? agent.currentStatus : "OFFLINE",
          printMode: agent.printMode || "windows",
          systemInfo: agent.systemInfo
        };
      });
      res.json({
        success: true,
        count: agents2.length,
        agents: agents2
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/routes/adminRoutes.ts
var adminRoutes = Router2();
adminRoutes.post("/login", AdminController.login);
adminRoutes.use(requireAdminAuth);
adminRoutes.get("/orders", AdminController.getOrders);
adminRoutes.get("/orders/:id", AdminController.getOrderDetails);
adminRoutes.post("/orders/:id/approve", AdminController.approveOrder);
adminRoutes.post("/orders/:id/reject", AdminController.rejectOrder);
adminRoutes.post("/orders/:id/retry", AdminController.retryOrder);
adminRoutes.get("/agents", AdminController.getAgents);

// server/routes/agentRoutes.ts
import { Router as Router3 } from "express";

// server/services/agentService.ts
var AgentService = class {
  static async recordHeartbeat(agentId, status, printerName, printMode, systemInfo) {
    let agent = await db2.getAgent(agentId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!agent) {
      agent = {
        id: agentId,
        name: "Counter Main Windows PC",
        token: "agent_secret_token_123",
        configuredPrinter: printerName || "EPSON L8050 Series",
        isActive: true,
        lastHeartbeatAt: now,
        currentStatus: status,
        printMode: printMode || "windows",
        systemInfo: systemInfo || void 0,
        createdAt: now,
        updatedAt: now
      };
    } else {
      agent.lastHeartbeatAt = now;
      agent.currentStatus = status;
      if (printerName) agent.configuredPrinter = printerName;
      if (printMode) agent.printMode = printMode;
      if (systemInfo) agent.systemInfo = { ...agent.systemInfo, ...systemInfo };
      agent.updatedAt = now;
    }
    await db2.saveAgent(agent);
    return agent;
  }
  static async getApprovedJobs() {
    return await db2.getApprovedOrders();
  }
  static async claimJob(orderId, agentId) {
    return await db2.claimApprovedOrder(orderId, agentId);
  }
  static async markPrinting(orderId, agentId) {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "PRINTING";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "PRINTING",
      actorType: "PRINT_AGENT",
      actorId: agentId,
      message: "Print Agent sent document to Windows Spooler / printer driver",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
  static async markCompleted(orderId, agentId, details) {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "COMPLETED";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "COMPLETED",
      actorType: "PRINT_AGENT",
      actorId: agentId,
      message: `Document successfully printed on Windows printer (${JSON.stringify(details || {})})`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
  static async markFailed(orderId, agentId, errorMessage) {
    const order = await db2.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "FAILED";
    order.failureReason = errorMessage || "Windows print spooler reported error";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db2.saveOrder(order);
    await db2.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: "FAILED",
      actorType: "PRINT_AGENT",
      actorId: agentId,
      message: `Print failed: ${errorMessage}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return order;
  }
};

// server/controllers/agentController.ts
var AgentController = class {
  static async authenticate(req, res) {
    const agent = req.agent;
    res.json({
      success: true,
      agent_id: agent.id,
      agent_name: agent.name,
      configured_printer: agent.configuredPrinter,
      message: "Agent authenticated successfully"
    });
  }
  static async heartbeat(req, res) {
    try {
      const agent = req.agent;
      const { status, printer_name, print_mode, system_info } = req.body;
      const updated = await AgentService.recordHeartbeat(
        agent.id,
        status || "IDLE",
        printer_name,
        print_mode,
        system_info
      );
      res.json({
        success: true,
        last_heartbeat_at: updated.lastHeartbeatAt
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getJobs(req, res) {
    try {
      const approvedJobs = await AgentService.getApprovedJobs();
      const formattedJobs = approvedJobs.map((order) => ({
        id: order.id,
        public_order_id: order.publicOrderId,
        publicOrderId: order.publicOrderId,
        status: order.status,
        customer_name: order.customerName,
        customerName: order.customerName,
        total_files: order.totalFiles,
        totalFiles: order.totalFiles,
        created_at: order.createdAt,
        createdAt: order.createdAt,
        files: order.files.map((file) => ({
          id: file.id,
          order_id: file.orderId,
          orderId: file.orderId,
          original_filename: file.originalFilename,
          originalFilename: file.originalFilename,
          mime_type: file.mimeType,
          mimeType: file.mimeType,
          file_size_bytes: file.fileSizeBytes,
          fileSizeBytes: file.fileSizeBytes,
          page_count: file.pageCount,
          pageCount: file.pageCount,
          print_settings: {
            paper_size: file.printSettings.paperSize,
            paperSize: file.printSettings.paperSize,
            color_mode: file.printSettings.colorMode,
            colorMode: file.printSettings.colorMode,
            sides: file.printSettings.sides,
            copies: file.printSettings.copies,
            page_range: file.printSettings.pageRange,
            pageRange: file.printSettings.pageRange
          },
          printSettings: file.printSettings
        }))
      }));
      res.json({
        success: true,
        count: formattedJobs.length,
        jobs: formattedJobs
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async claimJob(req, res) {
    try {
      const agent = req.agent;
      const { id } = req.params;
      const claimed = await AgentService.claimJob(id, agent.id);
      if (!claimed) {
        res.status(409).json({
          success: false,
          error: "Job could not be claimed. It may have already been claimed by another agent or status is not APPROVED."
        });
        return;
      }
      res.json({
        success: true,
        message: `Job ${id} claimed successfully by ${agent.id}`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async markPrinting(req, res) {
    try {
      const agent = req.agent;
      const { id } = req.params;
      const updated = await AgentService.markPrinting(id, agent.id);
      res.json({
        success: true,
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async markCompleted(req, res) {
    try {
      const agent = req.agent;
      const { id } = req.params;
      const { details } = req.body;
      const updated = await AgentService.markCompleted(id, agent.id, details);
      res.json({
        success: true,
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async markFailed(req, res) {
    try {
      const agent = req.agent;
      const { id } = req.params;
      const { error_message } = req.body;
      const updated = await AgentService.markFailed(id, agent.id, error_message);
      res.json({
        success: true,
        order: updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  static async downloadFile(req, res) {
    try {
      const { orderId, fileId } = req.params;
      const order = await OrderService.getOrderById(orderId);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: "File not found in order" });
        return;
      }
      const resolvedPath = StorageService.resolveFilePath(file.storageFilename);
      if (!resolvedPath) {
        res.status(404).json({ error: "File data missing from spool" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.originalFilename}"`);
      res.sendFile(resolvedPath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/auth/agentAuth.ts
async function requireAgentAuth(req, res, next) {
  let agentId = req.headers["x-agent-id"] || req.body && req.body.agent_id;
  const authHeader = req.headers["authorization"];
  const agentTokenHeader = req.headers["x-agent-token"];
  const token = agentTokenHeader || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || req.body && req.body.agent_token;
  if (!token) {
    res.status(401).json({
      error: "Unauthorized: Missing Agent Token."
    });
    return;
  }
  if (!agentId) {
    const allAgents = await db2.getAllAgents();
    const matchedAgent = allAgents.find((a) => a.token === token);
    if (matchedAgent) {
      agentId = matchedAgent.id;
    }
  }
  if (!agentId) {
    res.status(401).json({
      error: "Unauthorized: Missing Agent ID and token could not be mapped to an agent."
    });
    return;
  }
  const agent = await db2.getAgent(agentId);
  if (!agent) {
    res.status(401).json({
      error: `Unauthorized: Unknown Agent ID '${agentId}'.`
    });
    return;
  }
  if (!agent.isActive) {
    res.status(403).json({
      error: `Forbidden: Agent '${agentId}' is deactivated.`
    });
    return;
  }
  if (agent.token !== token) {
    res.status(401).json({
      error: "Unauthorized: Invalid Agent Token."
    });
    return;
  }
  req.agent = agent;
  next();
}

// server/routes/agentRoutes.ts
var agentRoutes = Router3();
agentRoutes.use(requireAgentAuth);
agentRoutes.post("/auth", AgentController.authenticate);
agentRoutes.post("/heartbeat", AgentController.heartbeat);
agentRoutes.get("/jobs", AgentController.getJobs);
agentRoutes.post("/jobs/:id/claim", AgentController.claimJob);
agentRoutes.post("/jobs/:id/printing", AgentController.markPrinting);
agentRoutes.post("/jobs/:id/completed", AgentController.markCompleted);
agentRoutes.post("/jobs/:id/failed", AgentController.markFailed);
agentRoutes.get("/jobs/:id/files/:fileId/download", AgentController.downloadFile);

// server/database/db.js
import { eq as eq2, desc as desc2 } from "drizzle-orm";
var CloudSqlDatabase2 = class {
  /**
   * Generates atomic public order IDs in the format PS-YYYYMMDD-001
   */
  async generatePublicOrderId() {
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          `INSERT INTO daily_sequences (date_str, next_seq)
           VALUES ($1, 2)
           ON CONFLICT (date_str)
           DO UPDATE SET next_seq = daily_sequences.next_seq + 1
           RETURNING next_seq - 1 AS current_seq;`,
          [today]
        );
        await client.query("COMMIT");
        const seq = res.rows[0].current_seq;
        const formatted = String(seq).padStart(3, "0");
        return `PS-${today}-${formatted}`;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("[DB] Error generating atomic public order ID:", e);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
      const randomSeq = Math.floor(100 + Math.random() * 900);
      return `PS-${today}-${randomSeq}`;
    }
  }
  /**
   * Retrieves all orders with their attached files, sorted newest first
   */
  async getOrders(statusFilter) {
    try {
      const orderRows = await db.query.orders.findMany({
        where: statusFilter && statusFilter !== "ALL" ? eq2(orders.status, statusFilter) : void 0,
        orderBy: [desc2(orders.createdAt)],
        with: {
          files: true
        }
      });
      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error("[DB] Failed to query orders from Cloud SQL:", error);
      throw new Error("Database query failed while fetching orders.", { cause: error });
    }
  }
  async getOrderById(id) {
    try {
      const orderRow = await db.query.orders.findFirst({
        where: eq2(orders.id, id),
        with: {
          files: true
        }
      });
      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query order ${id}:`, error);
      throw new Error(`Database query failed for order ${id}`, { cause: error });
    }
  }
  async getOrderByPublicId(publicOrderId) {
    try {
      const cleaned = publicOrderId.trim().toUpperCase();
      const orderRow = await db.query.orders.findFirst({
        where: eq2(orders.publicOrderId, cleaned),
        with: {
          files: true
        }
      });
      if (!orderRow) return null;
      return this.mapOrderRow(orderRow, orderRow.files);
    } catch (error) {
      console.error(`[DB] Failed to query public order ${publicOrderId}:`, error);
      throw new Error(`Database query failed for public order ${publicOrderId}`, { cause: error });
    }
  }
  async saveOrder(order) {
    try {
      await db.insert(orders).values({
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
        updatedAt: new Date(order.updatedAt)
      }).onConflictDoUpdate({
        target: orders.id,
        set: {
          status: order.status,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerNotes: order.customerNotes,
          rejectionReason: order.rejectionReason,
          failureReason: order.failureReason,
          totalFiles: order.totalFiles,
          claimedByAgent: order.claimedByAgent || null,
          updatedAt: new Date(order.updatedAt)
        }
      });
      if (order.files && order.files.length > 0) {
        for (const file of order.files) {
          await db.insert(files).values({
            id: file.id,
            orderId: order.id,
            originalFilename: file.originalFilename,
            storageFilename: file.storageFilename,
            storagePath: file.storagePath,
            mimeType: file.mimeType,
            fileSizeBytes: file.fileSizeBytes,
            pageCount: file.pageCount || 1,
            printSettings: file.printSettings,
            createdAt: new Date(file.createdAt)
          }).onConflictDoUpdate({
            target: files.id,
            set: {
              originalFilename: file.originalFilename,
              storageFilename: file.storageFilename,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              fileSizeBytes: file.fileSizeBytes,
              pageCount: file.pageCount || 1,
              printSettings: file.printSettings
            }
          });
        }
      }
      return order;
    } catch (error) {
      console.error("[DB] Failed to save order in Cloud SQL:", error);
      throw new Error("Database query failed while saving order.", { cause: error });
    }
  }
  async getApprovedOrders() {
    try {
      const orderRows = await db.query.orders.findMany({
        where: eq2(orders.status, "APPROVED"),
        orderBy: [desc2(orders.createdAt)],
        with: {
          files: true
        }
      });
      return orderRows.map((r) => this.mapOrderRow(r, r.files));
    } catch (error) {
      console.error("[DB] Failed to fetch approved orders:", error);
      throw new Error("Database query failed while fetching approved jobs.", { cause: error });
    }
  }
  /**
   * ATOMIC JOB CLAIMING
   * Uses SQL atomic condition UPDATE ... WHERE id = $1 AND status = 'APPROVED'
   * If two agents attempt to claim simultaneously, exactly one succeeds and the other gets rowCount = 0.
   */
  async claimApprovedOrder(orderId, agentId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const now = /* @__PURE__ */ new Date();
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
        await client.query("ROLLBACK");
        return false;
      }
      const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      await client.query(
        `INSERT INTO audit_logs (id, order_id, previous_status, new_status, actor_type, actor_id, message, created_at)
         VALUES ($1, $2, 'APPROVED', 'CLAIMED', 'PRINT_AGENT', $3, $4, $5);`,
        [
          auditId,
          orderId,
          agentId,
          `Order atomically claimed by Print Agent ${agentId}`,
          now
        ]
      );
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[DB] Error during atomic claim for order ${orderId}:`, err);
      return false;
    } finally {
      client.release();
    }
  }
  // --- AGENT TELEMETRY & PERSISTENCE ---
  async getAgent(agentId) {
    try {
      const agentRow = await db.query.agents.findFirst({
        where: eq2(agents.id, agentId)
      });
      if (!agentRow) return null;
      return this.mapAgentRow(agentRow);
    } catch (error) {
      console.error(`[DB] Failed to query agent ${agentId}:`, error);
      throw new Error(`Database query failed for agent ${agentId}`, { cause: error });
    }
  }
  async getAllAgents() {
    try {
      const agentRows = await db.query.agents.findMany({
        orderBy: [agents.id]
      });
      return agentRows.map((r) => this.mapAgentRow(r));
    } catch (error) {
      console.error("[DB] Failed to query all agents:", error);
      throw new Error("Database query failed while fetching agents.", { cause: error });
    }
  }
  async saveAgent(agent) {
    try {
      await db.insert(agents).values({
        id: agent.id,
        name: agent.name,
        token: agent.token,
        configuredPrinter: agent.configuredPrinter,
        isActive: agent.isActive,
        lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
        currentStatus: agent.currentStatus,
        printMode: agent.printMode || "windows",
        systemInfo: agent.systemInfo || null,
        createdAt: new Date(agent.createdAt),
        updatedAt: new Date(agent.updatedAt)
      }).onConflictDoUpdate({
        target: agents.id,
        set: {
          name: agent.name,
          token: agent.token,
          configuredPrinter: agent.configuredPrinter,
          isActive: agent.isActive,
          lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt) : null,
          currentStatus: agent.currentStatus,
          printMode: agent.printMode || "windows",
          systemInfo: agent.systemInfo || null,
          updatedAt: new Date(agent.updatedAt)
        }
      });
      return agent;
    } catch (error) {
      console.error("[DB] Failed to persist agent in Cloud SQL:", error);
      throw new Error("Database query failed while saving agent.", { cause: error });
    }
  }
  // --- AUDIT LOGS ---
  async logAudit(log) {
    try {
      await db.insert(auditLogs).values({
        id: log.id,
        orderId: log.orderId,
        previousStatus: log.previousStatus || null,
        newStatus: log.newStatus,
        actorType: log.actorType,
        actorId: log.actorId || null,
        message: log.message || null,
        createdAt: new Date(log.createdAt)
      });
    } catch (error) {
      console.warn("[DB] Could not write audit log to Cloud SQL:", error);
    }
  }
  async getAuditLogs(orderId) {
    try {
      const logs = await db.query.auditLogs.findMany({
        where: orderId ? eq2(auditLogs.orderId, orderId) : void 0,
        orderBy: [desc2(auditLogs.createdAt)],
        limit: 1e3
      });
      return logs.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        previousStatus: l.previousStatus || void 0,
        newStatus: l.newStatus,
        actorType: l.actorType,
        actorId: l.actorId || void 0,
        message: l.message || void 0,
        createdAt: l.createdAt.toISOString()
      }));
    } catch (error) {
      console.error("[DB] Failed to get audit logs:", error);
      return [];
    }
  }
  // --- ROW MAPPERS ---
  mapOrderRow(r, fileRows) {
    return {
      id: r.id,
      publicOrderId: r.publicOrderId,
      status: r.status,
      customerName: r.customerName || void 0,
      customerPhone: r.customerPhone || void 0,
      customerNotes: r.customerNotes || void 0,
      rejectionReason: r.rejectionReason || void 0,
      failureReason: r.failureReason || void 0,
      totalFiles: r.totalFiles,
      claimedByAgent: r.claimedByAgent || void 0,
      files: (fileRows || []).map((f) => ({
        id: f.id,
        orderId: f.orderId,
        originalFilename: f.originalFilename,
        storageFilename: f.storageFilename,
        storagePath: f.storagePath,
        mimeType: f.mimeType,
        fileSizeBytes: f.fileSizeBytes,
        pageCount: f.pageCount,
        printSettings: f.printSettings,
        createdAt: f.createdAt.toISOString()
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
  mapAgentRow(r) {
    return {
      id: r.id,
      name: r.name,
      token: r.token,
      configuredPrinter: r.configuredPrinter,
      isActive: r.isActive,
      lastHeartbeatAt: r.lastHeartbeatAt ? r.lastHeartbeatAt.toISOString() : void 0,
      currentStatus: r.currentStatus,
      printMode: r.printMode || "windows",
      systemInfo: r.systemInfo || void 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
};
var db3 = new CloudSqlDatabase2();

// server/storage/storage.js
import fs2 from "fs";
import path2 from "path";
import crypto3 from "crypto";
var UPLOAD_DIR2 = path2.resolve(process.cwd(), "uploads");
if (!fs2.existsSync(UPLOAD_DIR2)) {
  fs2.mkdirSync(UPLOAD_DIR2, { recursive: true });
}
var ALLOWED_MIME_TYPES2 = /* @__PURE__ */ new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png"
]);
var MAX_FILE_SIZE_BYTES2 = 20 * 1024 * 1024;
var StorageService2 = class {
  /**
   * Validates file metadata before processing.
   */
  static validateFile(mimeType, sizeBytes) {
    if (!ALLOWED_MIME_TYPES2.has(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported file format '${mimeType}'. Allowed formats: PDF, JPG, PNG.`
      };
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES2) {
      return {
        valid: false,
        error: `File exceeds maximum limit of 20 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB).`
      };
    }
    return { valid: true };
  }
  /**
   * Saves a buffer to disk using a cryptographically randomized filename.
   */
  static saveBuffer(originalName, mimeType, buffer) {
    const ext = path2.extname(originalName) || (mimeType === "application/pdf" ? ".pdf" : ".jpg");
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const randomHex = crypto3.randomBytes(16).toString("hex");
    const storageFilename = `${Date.now()}_${randomHex}${cleanExt}`;
    const storagePath = path2.join(UPLOAD_DIR2, storageFilename);
    fs2.writeFileSync(storagePath, buffer);
    return {
      originalFilename: path2.basename(originalName).slice(0, 200),
      storageFilename,
      storagePath,
      mimeType,
      fileSizeBytes: buffer.length
    };
  }
  /**
   * Resolves the absolute file path for a storageFilename.
   * Prevents directory traversal attacks.
   */
  static resolveFilePath(storageFilename) {
    const safeName = path2.basename(storageFilename);
    const fullPath = path2.join(UPLOAD_DIR2, safeName);
    if (!fs2.existsSync(fullPath)) {
      return null;
    }
    return fullPath;
  }
  /**
   * Deletes a file from disk.
   */
  static deleteFile(storageFilename) {
    try {
      const fullPath = this.resolveFilePath(storageFilename);
      if (fullPath && fs2.existsSync(fullPath)) {
        fs2.unlinkSync(fullPath);
        return true;
      }
    } catch (e) {
      console.warn(`[STORAGE] Could not delete file ${storageFilename}:`, e);
    }
    return false;
  }
};

// server/services/cleanupService.ts
var CleanupService = class {
  static {
    this.intervalHandle = null;
  }
  static {
    // Retention period: 24 hours for completed or rejected files
    this.RETENTION_HOURS = 24;
  }
  static startScheduler(intervalMs = 30 * 60 * 1e3) {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
    this.runCleanup();
  }
  static runCleanup() {
    const orders2 = db3.getOrders();
    const cutoff = Date.now() - this.RETENTION_HOURS * 3600 * 1e3;
    let deletedCount = 0;
    for (const order of orders2) {
      if ((order.status === "COMPLETED" || order.status === "REJECTED" || order.status === "CANCELLED") && new Date(order.updatedAt).getTime() < cutoff) {
        for (const file of order.files) {
          if (file.storageFilename) {
            const deleted = StorageService2.deleteFile(file.storageFilename);
            if (deleted) deletedCount++;
          }
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`[CLEANUP] Automatically pruned ${deletedCount} expired file(s) under retention policy.`);
    }
  }
};

// server.ts
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
var uploadsDir = path3.resolve(process.cwd(), "uploads");
var spoolDir = path3.resolve(process.cwd(), "spool");
if (!fs3.existsSync(uploadsDir)) fs3.mkdirSync(uploadsDir, { recursive: true });
if (!fs3.existsSync(spoolDir)) fs3.mkdirSync(spoolDir, { recursive: true });
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});
app.get("/api/system/info", async (req, res) => {
  try {
    const defaultAgent = await db2.getAgent("SHOP_001");
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const lastSeen = defaultAgent?.lastHeartbeatAt ? new Date(defaultAgent.lastHeartbeatAt).getTime() : 0;
    const secondsSinceHeartbeat = Math.round((Date.now() - lastSeen) / 1e3);
    const isOnline = defaultAgent ? secondsSinceHeartbeat <= 30 : false;
    res.json({
      shopName: "QuickPrint Xerox & Digital Press",
      appUrl,
      customerQrUrl: appUrl,
      defaultAgent: {
        id: defaultAgent?.id || "SHOP_001",
        name: defaultAgent?.name || "Counter Main Windows PC",
        printer: defaultAgent?.configuredPrinter || "EPSON L8050 Series",
        isOnline,
        secondsSinceHeartbeat,
        lastHeartbeatAt: defaultAgent?.lastHeartbeatAt || null,
        currentStatus: isOnline ? defaultAgent?.currentStatus || "IDLE" : "OFFLINE"
      },
      supportedFormats: ["PDF", "JPG", "JPEG", "PNG"],
      maxFileSizeMb: 20,
      maxFilesPerOrder: 10
    });
  } catch (err) {
    console.error("[API] Error in /api/system/info:", err);
    res.status(500).json({ error: "Failed to retrieve system info" });
  }
});
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agent", agentRoutes);
CleanupService.startScheduler();
async function setupViteOrStatic() {
  const distPath = path3.resolve(process.cwd(), "dist");
  const hasDist = fs3.existsSync(path3.join(distPath, "index.html"));
  if (hasDist) {
    app.use(express.static(distPath, { index: false }));
    app.use("/assets", express.static(path3.join(distPath, "assets")));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) {
        res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
        return;
      }
      const indexFile = path3.join(distPath, "index.html");
      res.sendFile(indexFile);
    });
    console.log("[SERVER] Serving optimized static production build with compiled Tailwind CSS from /dist");
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[SERVER] Mounted Vite middleware for development");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`=======================================================`);
    console.log(` Xerox Print Shop Automation Server running on port ${PORT}`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Mode: ${hasDist ? "Static Production" : "Vite Dev Middleware"}`);
    console.log(` Database: Persistent Google Cloud SQL (PostgreSQL)`);
    console.log(`=======================================================`);
  });
}
setupViteOrStatic();
