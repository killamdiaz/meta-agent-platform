import { Router } from 'express';
import { z } from 'zod';
import { agentManager } from '../core/AgentManager.js';
import { MemoryService } from '../services/MemoryService.js';
import { pool } from '../db.js';

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

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

const updateAgentSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    tools: z.union([z.record(z.unknown()), z.string()]).optional(),
    objectives: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    memory_context: z.string().optional(),
    status: z.enum(['idle', 'working', 'error']).optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update'
  });

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = updateAgentSchema.parse(req.body);
    const agent = await agentManager.updateAgent(id, payload);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    await agentManager.deleteAgent(id);
    res.status(204).send();
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
    const limit = Number(req.query.limit) || 10;
    const [memories, taskCounts] = await Promise.all([
      MemoryService.listMemories(id, limit),
      pool.query(
        `SELECT status, COUNT(*)::int as count
           FROM tasks
          WHERE agent_id = $1
          GROUP BY status`,
        [id]
      )
    ]);
    res.json({
      items: memories,
      taskCounts: Object.fromEntries(taskCounts.rows.map((row) => [row.status, row.count]))
    });
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
