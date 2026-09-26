import { Router } from 'express';
import multer from 'multer';
import { OrderController } from '../controllers/orderController.js';
import { MAX_FILE_SIZE_BYTES } from '../storage/storage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10,
  },
});

export const orderRoutes = Router();

// Customer submits an order (supports multipart file uploads or json base64 files)
orderRoutes.post('/', upload.array('files', 10), OrderController.createOrder);

// Customer queries live status by Public Order ID (e.g. PS-20260926-001)
orderRoutes.get('/:publicOrderId', OrderController.getOrderStatus);

// Customer / preview access to file
orderRoutes.get('/:orderId/files/:fileId', OrderController.getFile);
