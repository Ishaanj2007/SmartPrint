import { OrderService } from "../services/orderService.js";
import { db } from "../database/db.js";
import { ADMIN_PASSWORD, ADMIN_TOKEN, ADMIN_USERNAME } from "../auth/adminAuth.js";
class AdminController {
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
}
export {
  AdminController
};
