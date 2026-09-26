import crypto from "crypto";
import { db } from "../database/db.ts";
class OrderService {
  static async createOrder(input) {
    const orderId = `ord-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const publicOrderId = await db.generatePublicOrderId();
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
    await db.saveOrder(order);
    await db.logAudit({
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
    return await db.getOrderByPublicId(publicOrderId);
  }
  static async getOrderById(id) {
    return await db.getOrderById(id);
  }
  static async getOrders(statusFilter) {
    return await db.getOrders(statusFilter);
  }
  static async approveOrder(orderId, adminId = "admin") {
    const order = await db.getOrderById(orderId);
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
    await db.saveOrder(order);
    await db.logAudit({
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
    const order = await db.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order '${orderId}' not found.`);
    }
    const prev = order.status;
    order.status = "REJECTED";
    order.rejectionReason = reason || "Declined by shop administrator";
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await db.saveOrder(order);
    await db.logAudit({
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
    const order = await db.getOrderById(orderId);
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
    await db.saveOrder(order);
    await db.logAudit({
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
}
export {
  OrderService
};
