import { Request, Response } from 'express';
import { OrderService } from '../services/orderService.ts';
import { StorageService } from '../storage/storage.ts';
import { PrintSettings } from '../types.ts';

export class OrderController {
  public static async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const { customerName, customerPhone, customerNotes, defaultSettings } = req.body;
      const uploadedFiles = req.files as Express.Multer.File[];

      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: 'Please upload at least one document.' });
        return;
      }

      let parsedSettings: PrintSettings = {
        paperSize: 'A4',
        colorMode: 'BW',
        sides: 'SINGLE',
        copies: 1,
        pageRange: 'ALL',
      };

      if (defaultSettings) {
        try {
          parsedSettings = typeof defaultSettings === 'string' ? JSON.parse(defaultSettings) : defaultSettings;
        } catch (e) {
          // fallback to defaults
        }
      }

      const filesToProcess = [];
      for (const file of uploadedFiles) {
        const validation = StorageService.validateFile(file.mimetype, file.size);
        if (!validation.valid) {
          res.status(400).json({ error: validation.error });
          return;
        }

        const stored = StorageService.saveBuffer(file.originalname, file.mimetype, file.buffer);
        filesToProcess.push({
          originalFilename: stored.originalFilename,
          storageFilename: stored.storageFilename,
          storagePath: stored.storagePath,
          mimeType: stored.mimeType,
          fileSizeBytes: stored.fileSizeBytes,
          pageCount: 1,
          printSettings: parsedSettings,
        });
      }

      const newOrder = await OrderService.createOrder({
        customerName,
        customerPhone,
        customerNotes,
        files: filesToProcess,
      });

      res.status(201).json({
        success: true,
        orderId: newOrder.id,
        publicOrderId: newOrder.publicOrderId,
        status: newOrder.status,
        order: newOrder,
      });
    } catch (error: any) {
      console.error('[ORDER] Error creating order:', error);
      res.status(500).json({ error: error.message || 'Failed to submit order' });
    }
  }

  public static async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { publicOrderId } = req.params;
      const order =
        (await OrderService.getOrderByPublicId(publicOrderId)) ||
        (await OrderService.getOrderById(publicOrderId));

      if (!order) {
        res.status(404).json({ error: `Order '${publicOrderId}' not found.` });
        return;
      }

      res.json({
        success: true,
        order: {
          id: order.id,
          publicOrderId: order.publicOrderId,
          status: order.status,
          customerName: order.customerName,
          totalFiles: order.totalFiles,
          files: order.files.map((f) => ({
            id: f.id,
            originalFilename: f.originalFilename,
            fileSizeBytes: f.fileSizeBytes,
            mimeType: f.mimeType,
            printSettings: f.printSettings,
          })),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, fileId } = req.params;
      const order = await OrderService.getOrderById(orderId);

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const filePath = StorageService.resolveFilePath(file.storageFilename);
      if (!filePath) {
        res.status(404).json({ error: 'File data missing' });
        return;
      }

      res.setHeader('Content-Type', file.mimeType);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
