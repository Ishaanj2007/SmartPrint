import fs from "fs";
import path from "path";
const DB_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "db.json");
class Database {
  constructor() {
    this.saveTimeout = null;
    // Mutex lock for atomic job claiming
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
      token: process.env.AGENT_TOKEN || "YOUR_AGENT_SECRET_TOKEN",
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
}
const db = new Database();
export {
  db
};
