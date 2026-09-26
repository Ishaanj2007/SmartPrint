import { db } from '../database/db.ts';
import { Order, PrintAgent } from '../types.ts';

export class AgentService {
  public static async recordHeartbeat(
    agentId: string,
    status: 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE',
    printerName?: string,
    printMode?: 'windows' | 'mock',
    systemInfo?: Record<string, any>
  ): Promise<PrintAgent> {
    let agent = await db.getAgent(agentId);
    const now = new Date().toISOString();

    if (!agent) {
      // Auto-register if known agent ID
      agent = {
        id: agentId,
        name: 'Counter Main Windows PC',
        token: 'agent_secret_token_123',
        configuredPrinter: printerName || 'EPSON L8050 Series',
        isActive: true,
        lastHeartbeatAt: now,
        currentStatus: status,
        printMode: printMode || 'windows',
        systemInfo: systemInfo || undefined,
        createdAt: now,
        updatedAt: now,
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

  public static async getApprovedJobs(): Promise<Order[]> {
    return await db.getApprovedOrders();
  }

  public static async claimJob(orderId: string, agentId: string): Promise<boolean> {
    return await db.claimApprovedOrder(orderId, agentId);
  }

  public static async markPrinting(orderId: string, agentId: string): Promise<Order> {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'PRINTING';
    order.updatedAt = new Date().toISOString();

    await db.saveOrder(order);

    await db.logAudit({
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

  public static async markCompleted(orderId: string, agentId: string, details?: any): Promise<Order> {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'COMPLETED';
    order.updatedAt = new Date().toISOString();

    await db.saveOrder(order);

    await db.logAudit({
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

  public static async markFailed(orderId: string, agentId: string, errorMessage: string): Promise<Order> {
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'FAILED';
    order.failureReason = errorMessage || 'Windows print spooler reported error';
    order.updatedAt = new Date().toISOString();

    await db.saveOrder(order);

    await db.logAudit({
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
