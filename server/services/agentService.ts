import { db } from '../database/db.js';
import { Order, PrintAgent } from '../types.js';

export class AgentService {
  public static recordHeartbeat(
    agentId: string,
    status: 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE',
    printerName?: string,
    printMode?: 'windows' | 'mock',
    systemInfo?: Record<string, any>
  ): PrintAgent {
    const agent = db.getAgent(agentId);
    const now = new Date().toISOString();

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

  public static getApprovedJobs(): Order[] {
    return db.getApprovedOrders();
  }

  public static async claimJob(orderId: string, agentId: string): Promise<boolean> {
    return await db.claimApprovedOrder(orderId, agentId);
  }

  public static markPrinting(orderId: string, agentId: string): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'PRINTING';
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'PRINTING',
      actorType: 'PRINT_AGENT',
      actorId: agentId,
      message: 'Print Agent sent document to Windows Spooler / printer driver',
      createdAt: new Date().toISOString(),
    });

    return order;
  }

  public static markCompleted(orderId: string, agentId: string, details?: any): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'COMPLETED';
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'COMPLETED',
      actorType: 'PRINT_AGENT',
      actorId: agentId,
      message: `Document successfully printed on Windows printer (${JSON.stringify(details || {})})`,
      createdAt: new Date().toISOString(),
    });

    return order;
  }

  public static markFailed(orderId: string, agentId: string, errorMessage: string): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'FAILED';
    order.failureReason = errorMessage || 'Windows print spooler reported error';
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'FAILED',
      actorType: 'PRINT_AGENT',
      actorId: agentId,
      message: `Print failed: ${errorMessage}`,
      createdAt: new Date().toISOString(),
    });

    return order;
  }
}
