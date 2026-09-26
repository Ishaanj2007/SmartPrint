import { Router } from "express";
import { AgentController } from "../controllers/agentController.js";
import { requireAgentAuth } from "../auth/agentAuth.js";
const agentRoutes = Router();
agentRoutes.use(requireAgentAuth);
agentRoutes.post("/auth", AgentController.authenticate);
agentRoutes.post("/heartbeat", AgentController.heartbeat);
agentRoutes.get("/jobs", AgentController.getJobs);
agentRoutes.post("/jobs/:id/claim", AgentController.claimJob);
agentRoutes.post("/jobs/:id/printing", AgentController.markPrinting);
agentRoutes.post("/jobs/:id/completed", AgentController.markCompleted);
agentRoutes.post("/jobs/:id/failed", AgentController.markFailed);
agentRoutes.get("/jobs/:id/files/:fileId/download", AgentController.downloadFile);
export {
  agentRoutes
};
