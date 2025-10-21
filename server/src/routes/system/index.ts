import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../../middleware/jwtAuth.js';
import { perAgentRateLimiter } from '../../middleware/rateLimiter.js';
import { checkUserSubscription, fetchSystemStatus } from './service.js';

const subscriptionQuerySchema = z.object({
  userId: z.string().optional(),
});

const statusQuerySchema = z.object({
  component: z.string().optional(),
});

export const systemRouter = Router();

systemRouter.use(requireJwt);
systemRouter.use(perAgentRateLimiter());

systemRouter.get('/check-subscription', async (req, res, next) => {
  try {
    const { userId } = subscriptionQuerySchema.parse(req.query);
    const targetUser = userId ?? req.user?.id ?? 'unknown';
    const result = await checkUserSubscription(targetUser, req.context.requestId);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/fetch-status', async (req, res, next) => {
  try {
    const { component } = statusQuerySchema.parse(req.query);
    const result = await fetchSystemStatus(req.context.requestId);
    const components = component
      ? result.components.filter((entry: { component: string }) => entry.component === component)
      : result.components;
    return res.json({ ...result, components });
  } catch (error) {
    next(error);
  }
});
