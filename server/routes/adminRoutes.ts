import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { requireAdminAuth } from '../auth/adminAuth.js';

export const adminRoutes = Router();

// Public admin login
adminRoutes.post('/login', AdminController.login);

// Protected Admin endpoints
adminRoutes.use(requireAdminAuth);

adminRoutes.get('/orders', AdminController.getOrders);
adminRoutes.get('/orders/:id', AdminController.getOrderDetails);
adminRoutes.post('/orders/:id/approve', AdminController.approveOrder);
adminRoutes.post('/orders/:id/reject', AdminController.rejectOrder);
adminRoutes.post('/orders/:id/retry', AdminController.retryOrder);
adminRoutes.get('/agents', AdminController.getAgents);
