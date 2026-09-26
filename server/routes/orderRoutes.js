import { Router } from "express";
import multer from "multer";
import { OrderController } from "../controllers/orderController.ts";
import { MAX_FILE_SIZE_BYTES } from "../storage/storage.ts";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10
  }
});
const orderRoutes = Router();
orderRoutes.post("/", upload.array("files", 10), OrderController.createOrder);
orderRoutes.get("/:publicOrderId", OrderController.getOrderStatus);
orderRoutes.get("/:orderId/files/:fileId", OrderController.getFile);
export {
  orderRoutes
};
