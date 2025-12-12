import { Router } from 'express';
import { z } from 'zod';
import { workflowPlanSchema } from '../workflows/types.js';
import { workflowServices } from '../services/WorkflowService.js';

const router = Router();

const compileSchema = z.object({
  prompt: z.string().min(4, 'Prompt is required'),
});

const workflowIdSchema = z.string().uuid('Invalid workflow id');

const saveSchema = workflowPlanSchema.extend({
  id: z.string().uuid().optional(),
});

router.post('/compile', async (req, res, next) => {
  try {
    const { prompt } = compileSchema.parse(req.body);
    const plan = await workflowServices.compiler.compile(prompt);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const items = await workflowServices.storage.listWorkflows();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/:workflowId', async (req, res, next) => {
  try {
    const workflowId = workflowIdSchema.parse(req.params.workflowId);
    const workflow = await workflowServices.storage.getWorkflow(workflowId);
    if (!workflow) {
      res.status(404).json({ message: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const plan = saveSchema.parse(req.body);
    const saved = await workflowServices.storage.saveWorkflow(plan);
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

router.post('/:workflowId/run', async (req, res, next) => {
  try {
    const workflowId = workflowIdSchema.parse(req.params.workflowId);
    const payload = z.object({ eventPayload: z.record(z.unknown()).default({}) }).parse(req.body ?? {});
    const result = await workflowServices.engine.run(workflowId, {
      eventPayload: payload.eventPayload ?? {},
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
