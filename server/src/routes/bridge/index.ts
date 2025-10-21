import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../../middleware/jwtAuth.js';
import { requireHmac } from '../../middleware/hmacAuth.js';
import { perAgentRateLimiter } from '../../middleware/rateLimiter.js';
import {
  fetchBridgeContracts,
  fetchBridgeInvoices,
  fetchBridgeTasks,
  fetchBridgeUserSummary,
  recordBridgeNotification,
} from './dataService.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const taskQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
});

const notificationSchema = z.object({
  channel: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
});

export const bridgeRouter = Router();

bridgeRouter.use(requireJwt);
bridgeRouter.use(requireHmac);
bridgeRouter.use(perAgentRateLimiter());

bridgeRouter.get('/bridge-user-summary', async (req, res, next) => {
  try {
    const agentId = req.agentId as string;
    const data = await fetchBridgeUserSummary(agentId, req.context.requestId);
    res.json({ data, requestId: req.context.requestId });
  } catch (error) {
    next(error);
  }
});

bridgeRouter.get('/bridge-invoices', async (req, res, next) => {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const agentId = req.agentId as string;
    const result = await fetchBridgeInvoices(agentId, page, pageSize, req.context.requestId);
    res.json({
      data: result.items,
      pagination: result.pagination,
      requestId: req.context.requestId,
    });
  } catch (error) {
    next(error);
  }
});

bridgeRouter.get('/bridge-contracts', async (req, res, next) => {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const agentId = req.agentId as string;
    const result = await fetchBridgeContracts(agentId, page, pageSize, req.context.requestId);
    res.json({
      data: result.items,
      pagination: result.pagination,
      requestId: req.context.requestId,
    });
  } catch (error) {
    next(error);
  }
});

bridgeRouter.get('/bridge-tasks', async (req, res, next) => {
  try {
    const { page, pageSize, status } = taskQuerySchema.parse(req.query);
    const agentId = req.agentId as string;
    const result = await fetchBridgeTasks(
      agentId,
      page,
      pageSize,
      status,
      req.context.requestId,
    );
    res.json({
      data: result.items,
      pagination: result.pagination,
      requestId: req.context.requestId,
    });
  } catch (error) {
    next(error);
  }
});

bridgeRouter.post('/bridge-notify', async (req, res, next) => {
  try {
    const body = notificationSchema.parse(req.body);
    const agentId = req.agentId as string;
    const result = await recordBridgeNotification(agentId, req.context.requestId, body);
    res.json({ ...result, requestId: req.context.requestId });
  } catch (error) {
    next(error);
  }
});
