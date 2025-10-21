import { Router } from 'express';
import { z } from 'zod';
import { naturalLanguageAgentBuilder } from '../services/NaturalLanguageAgentBuilder.js';

const router = Router();

const buildSchema = z.object({
  promptText: z.string().min(1),
  options: z
    .object({
      persist: z.boolean().optional(),
      spawn: z.boolean().optional(),
      creator: z.string().optional()
    })
    .optional()
});

router.post('/', async (req, res, next) => {
  try {
    const payload = buildSchema.parse(req.body);
    const result = await naturalLanguageAgentBuilder.buildAgent(payload.promptText, payload.options ?? {});
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/spec', async (req, res, next) => {
  try {
    const payload = buildSchema.pick({ promptText: true, options: true }).parse(req.body);
    const creator = payload.options?.creator ?? 'anonymous';
    const spec = naturalLanguageAgentBuilder.buildSpec(payload.promptText, creator);
    return res.json({ spec });
  } catch (error) {
    next(error);
  }
});

export default router;
