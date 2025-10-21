import { Router } from 'express';
import { z } from 'zod';
import { automationEventBus, automationSessionManager } from '../automations/index.js';
import { automationPromptInterpreter, type InterpretationContext } from '../services/AutomationPromptInterpreter.js';
import type { AutomationAgentName } from '../automations/types.js';

const router = Router();

const sessionIdSchema = z.string().min(3, 'sessionId is required');

const messageSchema = z.object({
  sessionId: sessionIdSchema,
  message: z.string().min(1, 'message is required'),
});

const keySchema = z.object({
  sessionId: sessionIdSchema,
  agent: z.enum([
    'SlackTrigger',
    'GmailTrigger',
    'CronTrigger',
    'SummarizerAgent',
    'SlackAgent',
    'NotionAgent',
    'DiscordAgent',
    'EmailSenderAgent',
    'AtlasBridgeAgent',
    'AtlasContractsAgent',
    'AtlasInvoicesAgent',
    'AtlasTasksAgent',
    'AtlasNotifyAgent',
    'AtlasWorkspaceAgent',
  ]),
  value: z.string().min(1, 'key value is required'),
});

const interpretSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  context: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      pipeline: z
        .object({
          name: z.string().optional(),
          nodes: z
            .array(
              z.object({
                id: z.string(),
                agent: z.string().optional(),
                type: z.string().optional(),
                config: z.record(z.unknown()).optional(),
              }),
            )
            .optional(),
          edges: z
            .array(
              z.object({
                from: z.string(),
                to: z.string(),
                metadata: z.record(z.unknown()).optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

router.post('/interpret', async (req, res, next) => {
  try {
    const payload = interpretSchema.parse(req.body);
    const context: InterpretationContext = payload.context ?? {};
    const normalizedPipeline = context.pipeline
      ? {
          name: context.pipeline.name ?? null,
          nodes: context.pipeline.nodes ?? [],
          edges: context.pipeline.edges ?? [],
        }
      : undefined;
    const result = await automationPromptInterpreter.interpret(payload.prompt, {
      ...context,
      pipeline: normalizedPipeline,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/message', async (req, res, next) => {
  try {
    const payload = messageSchema.parse(req.body);
    const result = await automationSessionManager.processMessage(payload);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/key', async (req, res, next) => {
  try {
    const payload = keySchema.parse(req.body);
    // Discard the actual secret to avoid accidental retention.
    void payload.value;
    const result = await automationSessionManager.registerProvidedKey({
      sessionId: payload.sessionId,
      agent: payload.agent as AutomationAgentName,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/events', (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId query parameter is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const send = (event: string, payload: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  res.write('\n');

  const listeners: Array<() => void> = [];
  listeners.push(
    automationEventBus.onDrawer((event) => {
      if (event.sessionId !== sessionId) return;
      send('drawer', { isOpen: event.isOpen });
    }),
  );
  listeners.push(
    automationEventBus.onPipeline((event) => {
      if (event.sessionId !== sessionId) return;
      send('pipeline', event.pipeline);
    }),
  );
  listeners.push(
    automationEventBus.onNode((event) => {
      if (event.sessionId !== sessionId) return;
      send('node', event.node);
    }),
  );
  listeners.push(
    automationEventBus.onEdge((event) => {
      if (event.sessionId !== sessionId) return;
      send('edge', event.edge);
    }),
  );
  listeners.push(
    automationEventBus.onStatus((event) => {
      if (event.sessionId !== sessionId) return;
      send('status', { status: event.status, detail: event.detail ?? {} });
    }),
  );

  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      return;
    }
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 15000);

  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearInterval(heartbeat);
    for (const unsubscribe of listeners) {
      unsubscribe();
    }
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on('close', dispose);
  req.on('end', dispose);
});

router.delete('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }
  automationSessionManager.resetSession(sessionId);
  return res.status(204).end();
});

export default router;
