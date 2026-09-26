import { db } from "../database/db.ts";
class AgentService {
  static async recordHeartbeat(agentId, status, printerName, printMode, systemInfo) {
    let agent = await db.getAgent(agentId);
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
    await db.saveAgent(agent);
    return agent;
  }
  static async getApprovedJobs() {
    return await db.getApprovedOrders();
  }
  static async claimJob(orderId, agentId) {
    return await db.claimApprovedOrder(orderId, agentId);
  }
  static async markPrinting(orderId, agentId) {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "PRINTING";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db.saveOrder(order);
    await db.logAudit({
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
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "COMPLETED";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db.saveOrder(order);
    await db.logAudit({
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
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "FAILED";
    order.failureReason = errorMessage || "Windows print spooler reported error";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db.saveOrder(order);
    await db.logAudit({
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
