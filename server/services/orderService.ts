import crypto from 'crypto';
import { db } from '../database/db.js';
import { Order, OrderStatus, PrintFile, PrintSettings } from '../types.js';

export interface CreateOrderInput {
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  files: Array<{
    originalFilename: string;
    storageFilename: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
    pageCount?: number;
    printSettings: PrintSettings;
  }>;
}

export class OrderService {
  public static createOrder(input: CreateOrderInput): Order {
    const orderId = `ord-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const publicOrderId = db.generatePublicOrderId();
    const now = new Date().toISOString();

    const printFiles: PrintFile[] = input.files.map((f, index) => ({
      id: `file-${Date.now()}-${index}-${crypto.randomBytes(3).toString('hex')}`,
      orderId,
      originalFilename: f.originalFilename,
      storageFilename: f.storageFilename,
      storagePath: f.storagePath,
      mimeType: f.mimeType,
      fileSizeBytes: f.fileSizeBytes,
      pageCount: f.pageCount || 1,
      printSettings: f.printSettings,
      createdAt: now,
    }));

    const order: Order = {
      id: orderId,
      publicOrderId,
      status: 'PENDING',
      customerName: input.customerName || 'Walk-in Customer',
      customerPhone: input.customerPhone || '',
      customerNotes: input.customerNotes || '',
      totalFiles: printFiles.length,
      files: printFiles,
      createdAt: now,
      updatedAt: now,
    };

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: undefined,
      newStatus: 'PENDING',
      actorType: 'CUSTOMER',
      message: `Order submitted by customer with ${printFiles.length} file(s)`,
      createdAt: now,
    });

    return order;
  }

  public static getOrderByPublicId(publicOrderId: string): Order | undefined {
    return db.getOrderByPublicId(publicOrderId);
  }

  public static getOrderById(id: string): Order | undefined {
    return db.getOrderById(id);
  }

  public static getOrders(statusFilter?: string): Order[] {
    const orders = db.getOrders();
    if (!statusFilter || statusFilter === 'ALL') {
      return orders;
    }
    return orders.filter((o) => o.status === statusFilter.toUpperCase());
  }

  public static approveOrder(orderId: string, adminId = 'admin'): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    if (order.status !== 'PENDING' && order.status !== 'REJECTED') {
      throw new Error(`Cannot approve order in status '${order.status}'. Only PENDING or REJECTED orders can be approved.`);
    }

    const prev = order.status;
    order.status = 'APPROVED';
    order.rejectionReason = undefined;
    order.failureReason = undefined;
    order.claimedByAgent = undefined;
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'APPROVED',
      actorType: 'ADMIN',
      actorId: adminId,
      message: 'Order approved by shopkeeper. Made available to Print Agent.',
      createdAt: new Date().toISOString(),
    });

    return order;
  }

  public static rejectOrder(orderId: string, reason: string, adminId = 'admin'): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    const prev = order.status;
    order.status = 'REJECTED';
    order.rejectionReason = reason || 'Declined by shop administrator';
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'REJECTED',
      actorType: 'ADMIN',
      actorId: adminId,
      message: `Order rejected: ${order.rejectionReason}`,
      createdAt: new Date().toISOString(),
    });

    return order;
  }

  public static retryFailedOrder(orderId: string, adminId = 'admin'): Order {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }

    if (order.status !== 'FAILED') {
      throw new Error(`Only FAILED orders can be retried.`);
    }

    const prev = order.status;
    order.status = 'APPROVED';
    order.failureReason = undefined;
    order.claimedByAgent = undefined;
    order.updatedAt = new Date().toISOString();

    db.saveOrder(order);

    db.logAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      orderId,
      previousStatus: prev,
      newStatus: 'APPROVED',
      actorType: 'ADMIN',
      actorId: adminId,
      message: 'Failed print order reset to APPROVED for retry',
      createdAt: new Date().toISOString(),
    });

    return order;
  }
}
