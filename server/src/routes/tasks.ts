import { Router } from 'express';
import { z } from 'zod';
import { agentManager } from '../core/AgentManager.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const items = await agentManager.listTasks(status);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

const taskSchema = z.object({
  agentId: z.string().uuid(),
  prompt: z.string().min(1)
});

router.post('/', async (req, res, next) => {
  try {
    const body = taskSchema.parse(req.body);
    const task = await agentManager.addTask(body.agentId, body.prompt);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.post('/assign', async (req, res, next) => {
  try {
    const body = taskSchema.parse(req.body);
    const task = await agentManager.addTask(body.agentId, body.prompt);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

export default router;
