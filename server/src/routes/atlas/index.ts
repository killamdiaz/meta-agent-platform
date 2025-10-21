import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../../middleware/jwtAuth.js';
import { perAgentRateLimiter } from '../../middleware/rateLimiter.js';
import {
  createAtlasAgentExecution,
  executeContractOperation,
  fetchAtlasStream,
} from './service.js';

const agentRequestSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const streamRequestSchema = z.object({
  sessionId: z.string().min(1),
  cursor: z.string().optional(),
});

const contractOperationSchema = z.object({
  contractId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'cancel']),
  reason: z.string().optional(),
});

export const atlasRouter = Router();

atlasRouter.use(requireJwt);
atlasRouter.use(perAgentRateLimiter());

atlasRouter.post('/atlas-ai-agent', async (req, res, next) => {
  try {
    const body = agentRequestSchema.parse(req.body);
    const result = await createAtlasAgentExecution(body, req.context.requestId, req.user?.id ?? 'unknown');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

atlasRouter.post('/atlas-ai-stream', async (req, res, next) => {
  try {
    const body = streamRequestSchema.parse(req.body);
    const result = await fetchAtlasStream(body, req.context.requestId, req.agentId ?? body.sessionId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

atlasRouter.post('/contract-operations', async (req, res, next) => {
  try {
    const body = contractOperationSchema.parse(req.body);
    const result = await executeContractOperation(body, req.context.requestId, req.agentId ?? body.contractId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
