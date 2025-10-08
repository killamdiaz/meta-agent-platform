import { Router } from 'express';
import { z } from 'zod';
import { agentManager } from '../core/AgentManager.js';
import { MemoryService } from '../services/MemoryService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const agentId = req.query.agentId ? String(req.query.agentId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200;
    const agents = await agentManager.allAgents();
    const relevantAgents = agentId ? agents.filter((agent) => agent.id === agentId) : agents;
    const memories = await MemoryService.listGraph(agentId, safeLimit);
    res.json({
      agents: relevantAgents.map((agent) => ({
        ...agent,
        objectives: Array.isArray(agent.objectives)
          ? (agent.objectives as string[])
          : typeof agent.objectives === 'string'
            ? [agent.objectives]
            : [],
        tools: agent.tools ?? {},
        memory_context: agent.memory_context ?? ''
      })),
      memories: memories.map((memory) => ({
        id: memory.id,
        agent_id: memory.agent_id,
        agent_name: memory.agent_name,
        content: memory.content,
        metadata: memory.metadata ?? {},
        created_at: memory.created_at,
        embedding: memory.embedding
      }))
    });
  } catch (error) {
    next(error);
  }
});

const searchSchema = z.object({
  agentId: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().min(1).max(50).optional()
});

router.post('/search', async (req, res, next) => {
  try {
    const payload = searchSchema.parse(req.body);
    const items = await MemoryService.search(payload.agentId, payload.query, payload.limit ?? 5);
    res.json({
      items: items.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        content: item.content,
        metadata: item.metadata ?? {},
        created_at: item.created_at,
        embedding: item.embedding,
        similarity: item.similarity
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
