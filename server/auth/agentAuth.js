import { db } from "../database/db.ts";
async function requireAgentAuth(req, res, next) {
  let agentId = req.headers["x-agent-id"] || req.body && req.body.agent_id;
  const authHeader = req.headers["authorization"];
  const agentTokenHeader = req.headers["x-agent-token"];
  const token = agentTokenHeader || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || req.body && req.body.agent_token;
  if (!token) {
    res.status(401).json({
      error: "Unauthorized: Missing Agent Token."
    });
    return;
  }
  if (!agentId) {
    const allAgents = await db.getAllAgents();
    const matchedAgent = allAgents.find((a) => a.token === token);
    if (matchedAgent) {
      agentId = matchedAgent.id;
    }
  }
  if (!agentId) {
    res.status(401).json({
      error: "Unauthorized: Missing Agent ID and token could not be mapped to an agent."
    });
    return;
  }
  const agent = await db.getAgent(agentId);
  if (!agent) {
    res.status(401).json({
      error: `Unauthorized: Unknown Agent ID '${agentId}'.`
    });
    return;
  }
  if (!agent.isActive) {
    res.status(403).json({
      error: `Forbidden: Agent '${agentId}' is deactivated.`
    });
    return;
  }
  if (agent.token !== token) {
    res.status(401).json({
      error: "Unauthorized: Invalid Agent Token."
    });
    return;
  }
  req.agent = agent;
  next();
}
export {
  requireAgentAuth
};
