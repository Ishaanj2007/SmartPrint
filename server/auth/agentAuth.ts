import { Request, Response, NextFunction } from 'express';
import { db } from '../database/db.js';
import { PrintAgent } from '../types.js';

export interface AuthenticatedAgentRequest extends Request {
  agent?: PrintAgent;
}

export function requireAgentAuth(req: AuthenticatedAgentRequest, res: Response, next: NextFunction): void {
  const agentId = (req.headers['x-agent-id'] as string) || (req.body && req.body.agent_id);
  const authHeader = req.headers['authorization'];
  const agentTokenHeader = req.headers['x-agent-token'] as string;

  const token =
    agentTokenHeader ||
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
    (req.body && req.body.agent_token);

  if (!agentId || !token) {
    res.status(401).json({
      error: 'Unauthorized: Missing Agent ID or Agent Token.',
    });
    return;
  }

  const agent = db.getAgent(agentId);
  if (!agent) {
    res.status(401).json({
      error: `Unauthorized: Unknown Agent ID '${agentId}'.`,
    });
    return;
  }

  if (!agent.isActive) {
    res.status(403).json({
      error: `Forbidden: Agent '${agentId}' is deactivated.`,
    });
    return;
  }

  if (agent.token !== token) {
    res.status(401).json({
      error: 'Unauthorized: Invalid Agent Token.',
    });
    return;
  }

  req.agent = agent;
  next();
}
