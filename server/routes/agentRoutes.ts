import { Router } from 'express';
import { AgentController } from '../controllers/agentController.js';
import { requireAgentAuth } from '../auth/agentAuth.js';

export const agentRoutes = Router();

// All agent endpoints require agent token verification
agentRoutes.use(requireAgentAuth as any);

agentRoutes.post('/auth', AgentController.authenticate as any);
agentRoutes.post('/heartbeat', AgentController.heartbeat as any);
agentRoutes.get('/jobs', AgentController.getJobs as any);
agentRoutes.post('/jobs/:id/claim', AgentController.claimJob as any);
agentRoutes.post('/jobs/:id/printing', AgentController.markPrinting as any);
agentRoutes.post('/jobs/:id/completed', AgentController.markCompleted as any);
agentRoutes.post('/jobs/:id/failed', AgentController.markFailed as any);
agentRoutes.get('/jobs/:id/files/:fileId/download', AgentController.downloadFile as any);
