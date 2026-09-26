import { OrderService } from "../services/orderService.js";
import { StorageService } from "../storage/storage.js";
class OrderController {
  static async createOrder(req, res) {
    try {
      const {
        customerName,
        customerPhone,
        customerNotes,
        defaultSettings,
        files: jsonFilesInput,
        jsonFiles: alternativeJsonFiles
      } = req.body;
      const jsonFiles = alternativeJsonFiles || jsonFilesInput;
      let parsedDefaultSettings = {
        paperSize: "A4",
        colorMode: "BW",
        sides: "SINGLE",
        copies: 1,
        pageRange: "ALL"
      };
      if (defaultSettings) {
        try {
          const parsed = typeof defaultSettings === "string" ? JSON.parse(defaultSettings) : defaultSettings;
          parsedDefaultSettings = { ...parsedDefaultSettings, ...parsed };
        } catch (e) {
        }
      }
      const filesToProcess = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
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
            printSettings: parsedDefaultSettings
          });
        }
      }
      if (jsonFiles && Array.isArray(jsonFiles) && jsonFiles.length > 0) {
        for (const jf of jsonFiles) {
          if (!jf.base64Data || !jf.filename || !jf.mimeType) {
            continue;
          }
          const buffer = Buffer.from(jf.base64Data.replace(/^data:.*,/, ""), "base64");
          const validation = StorageService.validateFile(jf.mimeType, buffer.length);
          if (!validation.valid) {
            res.status(400).json({ error: validation.error });
            return;
          }
          const stored = StorageService.saveBuffer(jf.filename, jf.mimeType, buffer);
          const itemSettings = jf.printSettings ? { ...parsedDefaultSettings, ...jf.printSettings } : parsedDefaultSettings;
          filesToProcess.push({
            ...stored,
            pageCount: jf.pageCount || 1,
            printSettings: itemSettings
          });
        }
      }
      if (filesToProcess.length === 0) {
        res.status(400).json({
          error: "No valid documents uploaded. Please provide at least one PDF, JPG, or PNG file."
        });
        return;
      }
      if (filesToProcess.length > 10) {
        res.status(400).json({
          error: "Maximum 10 files allowed per print order."
        });
        return;
      }
      const order = OrderService.createOrder({
        customerName,
        customerPhone,
        customerNotes,
        files: filesToProcess
      });
      res.status(201).json({
        success: true,
        orderId: order.id,
        publicOrderId: order.publicOrderId,
        status: order.status,
        order
      });
    } catch (error) {
      console.error("[ORDER] Error creating order:", error);
      res.status(500).json({
        error: error.message || "Internal server error while creating order"
      });
    }
  }
  static async getOrderStatus(req, res) {
    try {
      const { publicOrderId } = req.params;
      const order = OrderService.getOrderByPublicId(publicOrderId) || OrderService.getOrderById(publicOrderId);
      if (!order) {
        res.status(404).json({
          error: `Order '${publicOrderId}' not found. Please verify your Order ID.`
        });
        return;
      }
      res.json({
        success: true,
        order
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  static async getFile(req, res) {
    try {
      const { orderId, fileId } = req.params;
      const order = OrderService.getOrderById(orderId) || OrderService.getOrderByPublicId(orderId);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      const file = order.files.find((f) => f.id === fileId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const filePath = StorageService.resolveFilePath(file.storageFilename);
      if (!filePath) {
        res.status(404).json({ error: "File on disk was removed or expired" });
        return;
      }
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalFilename)}"`);
      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
export {
  OrderController
};
