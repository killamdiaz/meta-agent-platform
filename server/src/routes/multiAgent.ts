import { Router } from 'express';
import { z } from 'zod';
import { MemoryStore } from '../multiAgent/MemoryStore.js';
import { MultiAgentOrchestrator } from '../multiAgent/Orchestrator.js';
import { agentBroker } from '../multiAgent/index.js';
import { toolRuntime } from '../multiAgent/ToolRuntime.js';

const router = Router();

const sessionSchema = z.object({
  prompt: z.string().min(10, 'Prompt should be at least 10 characters long'),
});

const streamSchema = z.object({
  prompt: z.string().min(10, 'Prompt should be at least 10 characters long'),
});

router.post('/sessions', async (req, res, next) => {
  try {
    const { prompt } = sessionSchema.parse(req.body);
    const orchestrator = new MultiAgentOrchestrator(new MemoryStore());
    const session = await orchestrator.runSession(prompt);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/sessions/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: string, payload: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  res.write('\n');

  let closed = false;
  req.on('close', () => {
    closed = true;
    if (!res.writableEnded) {
      res.end();
    }
  });

  try {
    const { prompt } = streamSchema.parse({ prompt: req.query.prompt });
    const memoryStore = new MemoryStore();
    const orchestrator = new MultiAgentOrchestrator(memoryStore);

    await orchestrator.runSession(prompt, {
      onAgents: (agents) => send('agents', agents),
      onMessage: (message) => send('message', message),
      onMemory: (memory) => send('memory', memory),
      onComplete: (result) => {
        send('complete', {
          sessionId: result.sessionId,
          userPrompt: result.userPrompt,
          memory: result.memory,
        });
        if (!closed) {
          send('close', { ok: true });
          res.end();
        }
      },
    });
  } catch (error) {
    send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
    if (!res.writableEnded) {
      res.end();
    }
  }
});

router.get('/memory', async (_req, res, next) => {
  try {
    const memoryStore = new MemoryStore();
    await memoryStore.initialise();
    res.json(memoryStore.getSnapshot());
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: string, payload: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  res.write('\n');

  const graph = agentBroker.getGraphSnapshot();
  send('graph', graph);

  const unsubscribeGraph = agentBroker.onGraph((snapshot) => send('graph', snapshot));
  const unsubscribeMessage = agentBroker.onMessage((message) => send('message', message));
  const unsubscribeState = agentBroker.onStateChange((update) => send('state', update));

  const dispose = () => {
    unsubscribeGraph();
    unsubscribeMessage();
    unsubscribeState();
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on('close', dispose);
  req.on('end', dispose);
});

router.get('/tool-agents', (_req, res) => {
  const agents = toolRuntime.describeAgents();
  res.json({ items: agents });
});

export default router;
