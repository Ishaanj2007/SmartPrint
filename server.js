// server.ts
import express from "express";
import path3 from "path";
import fs3 from "fs";

// server/routes/orderRoutes.js
import { Router } from "express";
import multer from "multer";

// server/services/orderService.js
import crypto from "crypto";

// server/database/db.js
import fs from "fs";
import path from "path";
var DB_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DB_DIR, "db.json");
var Database = class {
  constructor() {
    this.saveTimeout = null;
    this.claimingLock = false;
    this.data = {
      orders: {},
      agents: {},
      auditLogs: [],
      nextDailySequence: {}
    };
    this.init();
  }
  init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(raw);
      } else {
        this.seedDefaults();
        this.saveImmediately();
      }
    } catch (e) {
      console.warn("[DB] Failed to load db.json, using fresh store:", e);
      this.seedDefaults();
    }
  }
  seedDefaults() {
    const defaultAgent = {
      id: "SHOP_001",
      name: "Counter Main Windows PC",
      token: "agent_secret_token_123",
      configuredPrinter: "EPSON L8050 Series",
      isActive: true,
      lastHeartbeatAt: new Date(Date.now() - 5e3).toISOString(),
      currentStatus: "IDLE",
      printMode: "windows",
      systemInfo: {
        os: "Windows 10",
        printer: "EPSON L8050 Series",
        port: "USB002"
      },
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.data.agents[defaultAgent.id] = defaultAgent;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    const sampleId1 = "sample-ord-001";
    const samplePublicId1 = `PS-${today}-001`;
    this.data.orders[sampleId1] = {
      id: sampleId1,
      publicOrderId: samplePublicId1,
      status: "PENDING",
      customerName: "Alex Customer",
      customerPhone: "+1-555-0199",
      customerNotes: "Please print color on A4 single-sided. 2 copies.",
      totalFiles: 1,
      files: [
        {
          id: "file-sample-001",
          orderId: sampleId1,
          originalFilename: "project_presentation.pdf",
          storageFilename: "sample_project_presentation.pdf",
          storagePath: "sample_project_presentation.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 245600,
          pageCount: 6,
          printSettings: {
            paperSize: "A4",
            colorMode: "COLOR",
            sides: "SINGLE",
            copies: 2,
            pageRange: "ALL"
          },
          createdAt: new Date(Date.now() - 36e5).toISOString()
        }
      ],
      createdAt: new Date(Date.now() - 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 36e5).toISOString()
    };
    this.data.nextDailySequence[today] = 2;
  }
  scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveImmediately();
      this.saveTimeout = null;
    }, 400);
  }
  saveImmediately() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("[DB] Error persisting db.json:", e);
    }
  }
  // --- ORDER METHODS ---
  generatePublicOrderId() {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    const currentSeq = this.data.nextDailySequence[today] || 1;
    this.data.nextDailySequence[today] = currentSeq + 1;
    this.scheduleSave();
    const formatted = String(currentSeq).padStart(3, "0");
    return `PS-${today}-${formatted}`;
  }
  getOrders() {
    return Object.values(this.data.orders).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  getOrderById(id) {
    return this.data.orders[id];
  }
  getOrderByPublicId(publicOrderId) {
    const cleaned = publicOrderId.trim().toUpperCase();
    return Object.values(this.data.orders).find(
      (o) => o.publicOrderId.toUpperCase() === cleaned
    );
  }
  saveOrder(order) {
    this.data.orders[order.id] = order;
    this.scheduleSave();
    return order;
  }
  getApprovedOrders() {
    return Object.values(this.data.orders).filter((o) => o.status === "APPROVED");
  }
  /**
   * ATOMIC JOB CLAIMING
   * Ensures only ONE agent can claim an approved order.
   * If two agents attempt to claim simultaneously, exactly one succeeds.
   */
  async claimApprovedOrder(orderId, agentId) {
    while (this.claimingLock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.claimingLock = true;
    try {
      const order = this.data.orders[orderId];
      if (!order || order.status !== "APPROVED") {
        return false;
      }
      order.status = "CLAIMED";
      order.claimedByAgent = agentId;
      order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.logAudit({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        orderId,
        previousStatus: "APPROVED",
        newStatus: "CLAIMED",
        actorType: "PRINT_AGENT",
        actorId: agentId,
        message: `Order atomically claimed by Print Agent ${agentId}`,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.scheduleSave();
      return true;
    } finally {
      this.claimingLock = false;
    }
  }
  // --- AGENT METHODS ---
  getAgent(agentId) {
    return this.data.agents[agentId];
  }
  getAllAgents() {
    return Object.values(this.data.agents);
  }
  saveAgent(agent) {
    this.data.agents[agent.id] = agent;
    this.scheduleSave();
    return agent;
  }
  // --- AUDIT LOGS ---
  logAudit(log) {
    this.data.auditLogs.push(log);
    if (this.data.auditLogs.length > 1e3) {
      this.data.auditLogs = this.data.auditLogs.slice(-1e3);
    }
    this.scheduleSave();
  }
  getAuditLogs(orderId) {
    if (!orderId) return this.data.auditLogs;
    return this.data.auditLogs.filter((l) => l.orderId === orderId);
  }
};
var db = new Database();

// server/services/orderService.js
var OrderService = class {
  static createOrder(input) {
    const orderId = `ord-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const publicOrderId = db.generatePublicOrderId();
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
    db.saveOrder(order);
    db.logAudit({
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
  static getOrderByPublicId(publicOrderId) {
    return db.getOrderByPublicId(publicOrderId);
  }
  static getOrderById(id) {
    return db.getOrderById(id);
  }
  static getOrders(statusFilter) {
    const orders = db.getOrders();
    if (!statusFilter || statusFilter === "ALL") {
      return orders;
    }
    return orders.filter((o) => o.status === statusFilter.toUpperCase());
  }
  static approveOrder(orderId, adminId = "admin") {
    const order = db.getOrderById(orderId);
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
    db.saveOrder(order);
    db.logAudit({
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
  static rejectOrder(orderId, reason, adminId = "admin") {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "REJECTED";
    order.rejectionReason = reason || "Declined by shop administrator";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    db.saveOrder(order);
    db.logAudit({
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
  static retryFailedOrder(orderId, adminId = "admin") {
    const order = db.getOrderById(orderId);
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
    db.saveOrder(order);
    db.logAudit({
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

// server/storage/storage.js
import fs2 from "fs";
import path2 from "path";
import crypto2 from "crypto";
var UPLOAD_DIR = path2.resolve(process.cwd(), "uploads");
if (!fs2.existsSync(UPLOAD_DIR)) {
  fs2.mkdirSync(UPLOAD_DIR, { recursive: true });
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
    const ext = path2.extname(originalName) || (mimeType === "application/pdf" ? ".pdf" : ".jpg");
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const randomHex = crypto2.randomBytes(16).toString("hex");
    const storageFilename = `${Date.now()}_${randomHex}${cleanExt}`;
    const storagePath = path2.join(UPLOAD_DIR, storageFilename);
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
    const fullPath = path2.join(UPLOAD_DIR, safeName);
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

// server/controllers/orderController.js
var OrderController = class {
  static async createOrder(req, res) {
    try {
      const {
        customerName,
        customerPhone,
        customerNotes,
        defaultSettings,
        files: jsonFilesInput,
        jsonFiles: alternativeJsonFiles
      } = req.body;
      const jsonFiles = alternativeJsonFiles || jsonFilesInput;
      let parsedDefaultSettings = {
        paperSize: "A4",
        colorMode: "BW",
        sides: "SINGLE",
        copies: 1,
        pageRange: "ALL"
      };
      if (defaultSettings) {
        try {
          const parsed = typeof defaultSettings === "string" ? JSON.parse(defaultSettings) : defaultSettings;
          parsedDefaultSettings = { ...parsedDefaultSettings, ...parsed };
        } catch (e) {
        }
      }
      const filesToProcess = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
          const validation = StorageService.validateFile(file.mimetype, file.size);
          if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
          }
          const stored = StorageService.saveBuffer(
            file.originalname,
            file.mimetype,
            file.buffer
          );
          filesToProcess.push({
            ...stored,
            pageCount: 1,
            printSettings: parsedDefaultSettings
          });
        }
      }
      if (jsonFiles && Array.isArray(jsonFiles) && jsonFiles.length > 0) {
        for (const jf of jsonFiles) {
          if (!jf.base64Data || !jf.filename || !jf.mimeType) {
            continue;
          }
          const buffer = Buffer.from(jf.base64Data.replace(/^data:.*,/, ""), "base64");
          const validation = StorageService.validateFile(jf.mimeType, buffer.length);
          if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
          }
          const stored = StorageService.saveBuffer(jf.filename, jf.mimeType, buffer);
          const itemSettings = jf.printSettings ? { ...parsedDefaultSettings, ...jf.printSettings } : parsedDefaultSettings;
          filesToProcess.push({
            ...stored,
            pageCount: jf.pageCount || 1,
            printSettings: itemSettings
          });
        }
      }
      if (filesToProcess.length === 0) {
        res.status(400).json({
          error: "No valid documents uploaded. Please provide at least one PDF, JPG, or PNG file."
        });
        return;
      }
      if (filesToProcess.length > 10) {
        res.status(400).json({
          error: "Maximum 10 files allowed per print order."
        });
        return;
      }
      const order = OrderService.createOrder({
        customerName,
        customerPhone,
        customerNotes,
        files: filesToProcess
      });
      res.status(201).json({
        success: true,
        orderId: order.id,
        publicOrderId: order.publicOrderId,
        status: order.status,
        order
      });
    } catch (error) {
      console.error("[ORDER] Error creating order:", error);
      res.status(500).json({
        error: error.message || "Internal server error while creating order"
      });
    }
  }
  static async getOrderStatus(req, res) {
    try {
      const { publicOrderId } = req.params;
      const order = OrderService.getOrderByPublicId(publicOrderId) || OrderService.getOrderById(publicOrderId);
      if (!order) {
        res.status(404).json({
          error: `Order '${publicOrderId}' not found. Please verify your Order ID.`
        });
        return;
      }
      res.json({
        success: true,
        order
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getFile(req, res) {
    try {
      const { orderId, fileId } = req.params;
      const order = OrderService.getOrderById(orderId) || OrderService.getOrderByPublicId(orderId);
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
        res.status(404).json({ error: "File on disk was removed or expired" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalFilename)}"`);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/routes/orderRoutes.js
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

// server/routes/adminRoutes.js
import { Router as Router2 } from "express";

// server/auth/adminAuth.js
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

// server/controllers/adminController.js
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
      const orders = OrderService.getOrders(status);
      const allOrders = OrderService.getOrders();
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
        orders
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getOrderDetails(req, res) {
    try {
      const { id } = req.params;
      const order = OrderService.getOrderById(id) || OrderService.getOrderByPublicId(id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const auditLogs = db.getAuditLogs(order.id);
      res.json({
        success: true,
        order,
        auditLogs
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async approveOrder(req, res) {
    try {
      const { id } = req.params;
      const updated = OrderService.approveOrder(id);
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
      const updated = OrderService.rejectOrder(id, reason || "Rejected by shop admin");
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
      const updated = OrderService.retryFailedOrder(id);
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
      const agents = db.getAllAgents().map((agent) => {
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
        agents
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/routes/adminRoutes.js
var adminRoutes = Router2();
adminRoutes.post("/login", AdminController.login);
adminRoutes.use(requireAdminAuth);
adminRoutes.get("/orders", AdminController.getOrders);
adminRoutes.get("/orders/:id", AdminController.getOrderDetails);
adminRoutes.post("/orders/:id/approve", AdminController.approveOrder);
adminRoutes.post("/orders/:id/reject", AdminController.rejectOrder);
adminRoutes.post("/orders/:id/retry", AdminController.retryOrder);
adminRoutes.get("/agents", AdminController.getAgents);

// server/routes/agentRoutes.js
import { Router as Router3 } from "express";

// server/services/agentService.js
var AgentService = class {
  static recordHeartbeat(agentId, status, printerName, printMode, systemInfo) {
    const agent = db.getAgent(agentId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found.`);
    }
    agent.lastHeartbeatAt = now;
    agent.currentStatus = status;
    if (printerName) agent.configuredPrinter = printerName;
    if (printMode) agent.printMode = printMode;
    if (systemInfo) agent.systemInfo = { ...agent.systemInfo, ...systemInfo };
    agent.updatedAt = now;
    db.saveAgent(agent);
    return agent;
  }
  static getApprovedJobs() {
    return db.getApprovedOrders();
  }
  static async claimJob(orderId, agentId) {
    return await db.claimApprovedOrder(orderId, agentId);
  }
  static markPrinting(orderId, agentId) {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "PRINTING";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    db.saveOrder(order);
    db.logAudit({
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
  static markCompleted(orderId, agentId, details) {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "COMPLETED";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    db.saveOrder(order);
    db.logAudit({
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
  static markFailed(orderId, agentId, errorMessage) {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "FAILED";
    order.failureReason = errorMessage || "Windows print spooler reported error";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    db.saveOrder(order);
    db.logAudit({
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

// server/controllers/agentController.js
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
      const updated = AgentService.recordHeartbeat(
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
      const approvedJobs = AgentService.getApprovedJobs();
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
      const updated = AgentService.markPrinting(id, agent.id);
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
      const updated = AgentService.markCompleted(id, agent.id, details);
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
      const updated = AgentService.markFailed(id, agent.id, error_message);
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
      const { id, fileId } = req.params;
      const order = OrderService.getOrderById(id);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: "File not found in order" });
        return;
      }
      const filePath = StorageService.resolveFilePath(file.storageFilename);
      if (!filePath) {
        res.status(404).json({ error: "File content not found on server" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Length", file.fileSizeBytes);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalFilename)}"`);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

// server/auth/agentAuth.js
function requireAgentAuth(req, res, next) {
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
    const matchedAgent = db.getAllAgents().find((a) => a.token === token);
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
  const agent = db.getAgent(agentId);
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

// server/routes/agentRoutes.js
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

// server/services/cleanupService.js
var CleanupService = class {
  static {
    this.intervalHandle = null;
  }
  static {
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
    const orders = db.getOrders();
    const cutoff = Date.now() - this.RETENTION_HOURS * 3600 * 1e3;
    let deletedCount = 0;
    for (const order of orders) {
      if ((order.status === "COMPLETED" || order.status === "REJECTED" || order.status === "CANCELLED") && new Date(order.updatedAt).getTime() < cutoff) {
        for (const file of order.files) {
          if (file.storageFilename) {
            const deleted = StorageService.deleteFile(file.storageFilename);
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
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var isProduction = process.env.NODE_ENV === "production";
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});
app.get("/api/system/info", (req, res) => {
  const defaultAgent = db.getAgent("SHOP_001");
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  res.json({
    shopName: "QuickPrint Xerox & Digital Press",
    appUrl,
    customerQrUrl: appUrl,
    defaultAgent: {
      id: defaultAgent?.id || "SHOP_001",
      printer: defaultAgent?.configuredPrinter || "DEFAULT"
    },
    supportedFormats: ["PDF", "JPG", "JPEG", "PNG"],
    maxFileSizeMb: 20,
    maxFilesPerOrder: 10
  });
});
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agent", agentRoutes);
CleanupService.startScheduler();
async function setupViteOrStatic() {
  if (!isProduction) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[SERVER] Mounted Vite middleware for development");
  } else {
    const distPath = path3.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexFile = path3.join(distPath, "index.html");
      if (fs3.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Production build not found. Run npm run build first.");
      }
    });
    console.log("[SERVER] Serving static production build from /dist");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`=======================================================`);
    console.log(` Xerox Print Shop Automation Server running on port ${PORT}`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`=======================================================`);
  });
}
setupViteOrStatic().catch((err) => {
  console.error("[FATAL] Failed to start server:", err);
  process.exit(1);
});
