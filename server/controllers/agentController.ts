import { Response } from 'express';
import { AuthenticatedAgentRequest } from '../auth/agentAuth.js';
import { AgentService } from '../services/agentService.js';
import { OrderService } from '../services/orderService.js';
import { StorageService } from '../storage/storage.js';

export class AgentController {
  public static async authenticate(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    const agent = req.agent!;
    res.json({
      success: true,
      agent_id: agent.id,
      agent_name: agent.name,
      configured_printer: agent.configuredPrinter,
      message: 'Agent authenticated successfully',
    });
  }

  public static async heartbeat(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const agent = req.agent!;
      const { status, printer_name, print_mode, system_info } = req.body;

      const updated = AgentService.recordHeartbeat(
        agent.id,
        status || 'IDLE',
        printer_name,
        print_mode,
        system_info
      );

      res.json({
        success: true,
        last_heartbeat_at: updated.lastHeartbeatAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async getJobs(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const approvedJobs = AgentService.getApprovedJobs();
      // Format jobs to provide both snake_case and camelCase compatibility with python agent
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
            pageRange: file.printSettings.pageRange,
          },
          printSettings: file.printSettings,
        })),
      }));

      res.json({
        success: true,
        count: formattedJobs.length,
        jobs: formattedJobs,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async claimJob(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const agent = req.agent!;
      const { id } = req.params;

      const claimed = await AgentService.claimJob(id, agent.id);

      if (!claimed) {
        res.status(409).json({
          success: false,
          error: 'Job could not be claimed. It may have already been claimed by another agent or status is not APPROVED.',
        });
        return;
      }

      res.json({
        success: true,
        message: `Job ${id} claimed successfully by ${agent.id}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async markPrinting(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const agent = req.agent!;
      const { id } = req.params;

      const updated = AgentService.markPrinting(id, agent.id);
      res.json({
        success: true,
        order: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  public static async markCompleted(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const agent = req.agent!;
      const { id } = req.params;
      const { details } = req.body;

      const updated = AgentService.markCompleted(id, agent.id, details);
      res.json({
        success: true,
        order: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  public static async markFailed(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const agent = req.agent!;
      const { id } = req.params;
      const { error_message } = req.body;

      const updated = AgentService.markFailed(id, agent.id, error_message);
      res.json({
        success: true,
        order: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  public static async downloadFile(req: AuthenticatedAgentRequest, res: Response): Promise<void> {
    try {
      const { id, fileId } = req.params;
      const order = OrderService.getOrderById(id);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: 'File not found in order' });
        return;
      }

      const filePath = StorageService.resolveFilePath(file.storageFilename);
      if (!filePath) {
        res.status(404).json({ error: 'File content not found on server' });
        return;
      }

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', file.fileSizeBytes);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalFilename)}"`);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
