import { db } from "../database/db.js";
class AgentService {
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
}
export {
  AgentService
};
