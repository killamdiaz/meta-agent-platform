import { Router } from 'express';
import { z } from 'zod';
import { agentManager } from '../core/AgentManager.js';
import { MemoryService } from '../services/MemoryService.js';

const router = Router();

const createAgentSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(2),
  tools: z.record(z.boolean()).default({}),
  objectives: z.array(z.string()).default([]),
  memory_context: z.string().optional()
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createAgentSchema.parse(req.body);
    const agent = await agentManager.createAgent({
      name: payload.name,
      role: payload.role,
      tools: payload.tools,
      objectives: payload.objectives,
      memory_context: payload.memory_context ?? ''
    });
    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const agents = await agentManager.allAgents();
    res.json({ items: agents });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/task', async (req, res, next) => {
  try {
    const body = z
      .object({
        prompt: z.string().min(1)
      })
      .parse(req.body);
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    const task = await agentManager.addTask(id, body.prompt);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/memory', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    const items = await MemoryService.listMemories(id, Number(req.query.limit) || 10);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = z
      .object({
        status: z.enum(['idle', 'working', 'error'])
      })
      .parse(req.body);
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    await agentManager.setAgentStatus(id, body.status);
    res.json({ ...agent, status: body.status });
  } catch (error) {
    next(error);
  }
});

export default router;
