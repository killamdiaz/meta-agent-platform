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

const toolAgentCommandSchema = z.object({
  prompt: z.string().min(3, 'Prompt is required'),
  agentId: z.string().min(2, 'agentId must be at least 2 characters').optional(),
  limit: z
    .number()
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must be <= 100')
    .optional(),
  mode: z.enum(['auto', 'context', 'task']).optional(),
});

type ToolAgentDescriptor = ReturnType<typeof toolRuntime.describeAgents>[number];

const TOOL_AGENT_HINTS: Array<{
  pattern: RegExp;
  keywords: RegExp[];
}> = [
  {
    pattern: /\b(task|tasks|todo|follow[-\s]?up|backlog)\b/i,
    keywords: [/task/],
  },
  {
    pattern: /\b(invoice|billing|payment|receivable|payable)\b/i,
    keywords: [/invoice|finance/],
  },
  {
    pattern: /\b(contract|agreement|deal|signature)\b/i,
    keywords: [/contract/],
  },
  {
    pattern: /\b(notify|notification|alert|broadcast)\b/i,
    keywords: [/notify|alert/],
  },
  {
    pattern: /\b(workspace|overview|summary|plan)\b/i,
    keywords: [/workspace|overview/],
  },
  {
    pattern: /\b(calendar|meeting|schedule|livekit|call)\b/i,
    keywords: [/calendar|meeting/],
  },
  {
    pattern: /\b(summary|summaries|summarize|digest|recap)\b/i,
    keywords: [/summary|summarizer|digest/],
  },
];

const normalise = (value: string) => value.toLowerCase();

const matchesKeyword = (agent: ToolAgentDescriptor, regex: RegExp): boolean => {
  const name = normalise(agent.name);
  const role = normalise(agent.role ?? '');
  const type = normalise(agent.agentType ?? '');
  return regex.test(name) || regex.test(role) || regex.test(type);
};

const findAgentByPrompt = (prompt: string, agents: ToolAgentDescriptor[]): ToolAgentDescriptor | null => {
  const lowered = prompt.toLowerCase();

  for (const rule of TOOL_AGENT_HINTS) {
    if (!rule.pattern.test(lowered)) continue;
    const candidate = agents.find((agent) => rule.keywords.some((keyword) => matchesKeyword(agent, keyword)));
    if (candidate) {
      return candidate;
    }
  }

  const explicitByName = agents.find((agent) => lowered.includes(agent.name.toLowerCase()));
  if (explicitByName) {
    return explicitByName;
  }

  const explicitByType = agents.find((agent) => lowered.includes((agent.agentType ?? '').toLowerCase()));
  if (explicitByType) {
    return explicitByType;
  }

  return null;
};

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

router.post('/tool-agents/run', async (req, res, next) => {
  try {
    const payload = toolAgentCommandSchema.parse(req.body);
    const agents = toolRuntime.describeAgents();
    if (!agents || agents.length === 0) {
      res.status(503).json({ message: 'No tool agents are currently registered.' });
      return;
    }

    let target: ToolAgentDescriptor | undefined;
    if (payload.agentId) {
      const lookup = payload.agentId.toLowerCase();
      target = agents.find(
        (agent) =>
          agent.id.toLowerCase() === lookup ||
          (agent.agentType ?? '').toLowerCase() === lookup ||
          agent.name.toLowerCase() === lookup,
      );
      if (!target) {
        res.status(404).json({ message: `Tool agent ${payload.agentId} not found.` });
        return;
      }
    } else {
      target = findAgentByPrompt(payload.prompt, agents) ?? undefined;
      if (!target) {
        res.status(422).json({ message: 'No matching tool agent for prompt.' });
        return;
      }
    }

    const mode =
      payload.mode && payload.mode !== 'auto'
        ? payload.mode
        : /\b(fetch|list|get|show|display|pull|retrieve|give me|gimme)\b/i.test(payload.prompt)
          ? 'context'
          : 'task';

    const topMatch = payload.prompt.match(/\btop\s+(\d{1,2})\b/i);
    const inferredLimit =
      payload.limit ??
      (/\ball\b/i.test(payload.prompt)
        ? 50
        : topMatch
          ? Number.parseInt(topMatch[1], 10)
          : undefined);
    const limit = Math.min(Math.max(inferredLimit ?? 10, 1), 100);

    const metadata: Record<string, unknown> = {
      intent: mode === 'context' ? 'request_context' : 'task',
      eventType: mode === 'context' ? 'request_context' : 'task',
      requestedBy: 'agent-network',
      mode,
      originalPrompt: payload.prompt,
      payload: {
        prompt: payload.prompt,
        mode,
        limit: mode === 'context' ? limit : undefined,
      },
    };

    if (mode === 'context') {
      metadata.limit = limit;
    }

    const message = agentBroker.publish({
      from: 'agent-network-prompt',
      to: target.id,
      type: 'task',
      content: payload.prompt,
      metadata,
    });

    res.json({
      status: 'dispatched',
      agent: {
        id: target.id,
        name: target.name,
        role: target.role,
        agentType: target.agentType,
      },
      messageId: message.id,
      dispatchedAt: message.timestamp,
      mode,
      limit: mode === 'context' ? limit : undefined,
    });
  } catch (error) {
    next(error);
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
  send('tokens', agentBroker.getTokenUsage());

  const unsubscribeGraph = agentBroker.onGraph((snapshot) => send('graph', snapshot));
  const unsubscribeMessage = agentBroker.onMessage((message) => send('message', message));
  const unsubscribeState = agentBroker.onStateChange((update) => send('state', update));
  const unsubscribeTokens = agentBroker.onTokenUsage((usage) => send('tokens', usage));

  const dispose = () => {
    unsubscribeGraph();
    unsubscribeMessage();
    unsubscribeState();
    unsubscribeTokens();
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

router.get('/tool-agents/:agentId/logs', (req, res) => {
  const agentId = req.params.agentId.trim();
  if (!agentId) {
    res.status(400).json({ message: 'agentId is required' });
    return;
  }

  const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
  const resolvedLimit =
    typeof limitParam === 'number' && Number.isFinite(limitParam) && !Number.isNaN(limitParam) ? limitParam : undefined;
  const limit = Math.min(Math.max(resolvedLimit ?? 200, 1), 500);

  const history = agentBroker.getHistory();
  const relevant = history.filter((message) => message.from === agentId || message.to === agentId);
  const sliceStart = Math.max(relevant.length - limit, 0);
  const recent = relevant.slice(sliceStart);

  const logs = recent.map((message) => ({
    id: message.id,
    timestamp: message.timestamp,
    direction: message.from === agentId ? 'outgoing' : 'incoming',
    counterpart: message.from === agentId ? message.to : message.from,
    type: message.type,
    content: message.content,
    metadata: message.metadata ?? {},
  }));

  res.json({ items: logs });
});

export default router;
