import { Router } from "express";
import { AdminController } from "../controllers/adminController.ts";
import { requireAdminAuth } from "../auth/adminAuth.ts";
const adminRoutes = Router();
adminRoutes.post("/login", AdminController.login);
adminRoutes.use(requireAdminAuth);
adminRoutes.get("/orders", AdminController.getOrders);
adminRoutes.get("/orders/:id", AdminController.getOrderDetails);
adminRoutes.post("/orders/:id/approve", AdminController.approveOrder);
adminRoutes.post("/orders/:id/reject", AdminController.rejectOrder);
adminRoutes.post("/orders/:id/retry", AdminController.retryOrder);
adminRoutes.get("/agents", AdminController.getAgents);
export {
  adminRoutes
};
