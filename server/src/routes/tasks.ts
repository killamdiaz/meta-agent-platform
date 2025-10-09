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

router.get('/:taskId/stream', async (req, res, next) => {
  try {
    const taskId = String(req.params.taskId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    const flush = (res as unknown as { flushHeaders?: () => void }).flushHeaders;
    if (typeof flush === 'function') {
      flush.call(res);
    }

    let closed = false;
    const safeEnd = () => {
      if (closed) return;
      closed = true;
      res.end();
    };

    const send = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify({ taskId, ...payload })}\n\n`);
    };

    const task = await agentManager.getTask(taskId);
    if (!task) {
      send({ type: 'error', status: 'error', message: 'Task not found' });
      safeEnd();
      return;
    }

    let agent = await agentManager.getAgent(task.agent_id);
    send({ type: 'status', status: task.status, task, agent });

    const unsubscribe = agentManager.onTaskEvent(taskId, (event) => {
      if (event.type !== 'token') {
        agent = event.agent ?? agent;
      }

      if (event.type === 'token') {
        send({ type: 'token', token: event.token, agent });
        return;
      }

      if (event.type === 'log') {
        send({ type: 'log', message: event.message, detail: event.detail, agent: event.agent ?? agent });
        return;
      }

      if (event.type === 'status') {
        send({ type: 'status', status: event.status, task: event.task, agent: event.agent ?? agent });
        return;
      }

      if (event.type === 'complete') {
        send({ type: 'complete', status: event.status, task: event.task, agent: event.agent ?? agent });
        unsubscribe();
        safeEnd();
        return;
      }

      if (event.type === 'error') {
        send({
          type: 'error',
          status: event.status,
          message: event.message,
          task: event.task,
          agent: event.agent ?? agent
        });
        unsubscribe();
        safeEnd();
      }
    });

    req.on('close', () => {
      unsubscribe();
      safeEnd();
    });
  } catch (error) {
    next(error);
  }
});

router.post('/assign', async (req, res, next) => {
  try {
    const body = z
      .object({
        agentId: z.string().uuid(),
        prompt: z.string().min(1)
      })
      .parse(req.body);
    const task = await agentManager.addTask(body.agentId, body.prompt);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

export default router;
