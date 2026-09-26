import { Request, Response } from 'express';
import { OrderService } from '../services/orderService.js';
import { StorageService } from '../storage/storage.js';
import { PrintSettings } from '../types.js';

export class OrderController {
  public static async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const {
        customerName,
        customerPhone,
        customerNotes,
        defaultSettings,
        files: jsonFilesInput,
        jsonFiles: alternativeJsonFiles,
      } = req.body;

      const jsonFiles = alternativeJsonFiles || jsonFilesInput;

      // Parse default print settings
      let parsedDefaultSettings: PrintSettings = {
        paperSize: 'A4',
        colorMode: 'BW',
        sides: 'SINGLE',
        copies: 1,
        pageRange: 'ALL',
      };

      if (defaultSettings) {
        try {
          const parsed = typeof defaultSettings === 'string' ? JSON.parse(defaultSettings) : defaultSettings;
          parsedDefaultSettings = { ...parsedDefaultSettings, ...parsed };
        } catch (e) {
          // ignore parsing error, use default
        }
      }

      const filesToProcess: Array<{
        originalFilename: string;
        storageFilename: string;
        storagePath: string;
        mimeType: string;
        fileSizeBytes: number;
        pageCount?: number;
        printSettings: PrintSettings;
      }> = [];

      // 1. Process files from multer (if multipart upload)
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files as Express.Multer.File[]) {
          const validation = StorageService.validateFile(file.mimetype, file.size);
          if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
          }

          const stored = StorageService.saveBuffer(
            file.originalname,
            file.mimetype,
            file.buffer
          );

          filesToProcess.push({
            ...stored,
            pageCount: 1,
            printSettings: parsedDefaultSettings,
          });
        }
      }

      // 2. Process base64 JSON files (alternative upload method)
      if (jsonFiles && Array.isArray(jsonFiles) && jsonFiles.length > 0) {
        for (const jf of jsonFiles) {
          const rawBase64 = jf.base64Data || jf.fileBase64 || jf.data || jf.content;
          if (!rawBase64 || !jf.filename || !jf.mimeType) {
            continue;
          }
          const buffer = Buffer.from(rawBase64.replace(/^data:.*,/, ''), 'base64');
          const validation = StorageService.validateFile(jf.mimeType, buffer.length);
          if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
          }

          const stored = StorageService.saveBuffer(jf.filename, jf.mimeType, buffer);
          const itemSettings: PrintSettings = jf.printSettings
            ? { ...parsedDefaultSettings, ...jf.printSettings }
            : parsedDefaultSettings;

          filesToProcess.push({
            ...stored,
            pageCount: jf.pageCount || 1,
            printSettings: itemSettings,
          });
        }
      }

      if (filesToProcess.length === 0) {
        res.status(400).json({
          error: 'No valid documents uploaded. Please provide at least one PDF, JPG, or PNG file.',
        });
        return;
      }

      if (filesToProcess.length > 10) {
        res.status(400).json({
          error: 'Maximum 10 files allowed per print order.',
        });
        return;
      }

      const order = OrderService.createOrder({
        customerName,
        customerPhone,
        customerNotes,
        files: filesToProcess,
      });

      res.status(201).json({
        success: true,
        orderId: order.id,
        publicOrderId: order.publicOrderId,
        status: order.status,
        order,
      });
    } catch (error: any) {
      console.error('[ORDER] Error creating order:', error);
      res.status(500).json({
        error: error.message || 'Internal server error while creating order',
      });
    }
  }

  public static async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { publicOrderId } = req.params;
      const order = OrderService.getOrderByPublicId(publicOrderId) || OrderService.getOrderById(publicOrderId);

      if (!order) {
        res.status(404).json({
          error: `Order '${publicOrderId}' not found. Please verify your Order ID.`,
        });
        return;
      }

      res.json({
        success: true,
        order,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  public static async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, fileId } = req.params;
      const order = OrderService.getOrderById(orderId) || OrderService.getOrderByPublicId(orderId);

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
        res.status(404).json({ error: 'File on disk was removed or expired' });
        return;
      }

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalFilename)}"`);
      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
