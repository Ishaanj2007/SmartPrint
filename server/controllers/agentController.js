import { AgentService } from "../services/agentService.ts";
import { OrderService } from "../services/orderService.ts";
import { StorageService } from "../storage/storage.ts";
class AgentController {
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
}
export {
  AgentController
};
