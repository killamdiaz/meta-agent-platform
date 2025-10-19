import { Router } from 'express';
import { pool } from '../db.js';
import { MemoryService } from '../services/MemoryService.js';

const router = Router();

function mapAgentStatus(status: string): 'active' | 'new' | 'older' | 'forgotten' | 'expiring' {
  switch (status) {
    case 'working':
      return 'active';
    case 'error':
      return 'expiring';
    default:
      return 'older';
  }
}

function mapMemoryStatus(memory: { created_at: string }): 'active' | 'new' | 'older' | 'forgotten' | 'expiring' {
  const created = new Date(memory.created_at).getTime();
  const ageHours = (Date.now() - created) / (1000 * 60 * 60);
  if (Number.isNaN(ageHours) || ageHours < 0) {
    return 'active';
  }
  if (ageHours < 6) {
    return 'new';
  }
  if (ageHours < 72) {
    return 'active';
  }
  if (ageHours < 168) {
    return 'older';
  }
  return 'forgotten';
}

router.get('/graph', async (_req, res, next) => {
  try {
    const [agentsResult, memoriesResult, tasksResult] = await Promise.all([
      pool.query<{
        id: string;
        name: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>('SELECT id, name, status, created_at, updated_at FROM agents ORDER BY created_at ASC'),
      pool.query<{
        id: string;
        agent_id: string;
        content: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT id,
                agent_id,
                content,
                metadata,
                created_at
           FROM agent_memory
          WHERE memory_type = 'long_term'
            AND COALESCE(metadata->>'category', '') <> 'conversation'
            AND content NOT ILIKE 'received % message %'
            AND content NOT ILIKE 'sent % message %'
            AND content NOT ILIKE 'reply to %'
            AND content NOT ILIKE 'sent to slack%'
            AND content NOT ILIKE 'slack user%'
          ORDER BY created_at DESC
          LIMIT 300`
      ),
      pool.query<{
        id: string;
        agent_id: string;
        prompt: string;
        status: string;
        created_at: string;
      }>(
        `SELECT id, agent_id, prompt, status, created_at
           FROM tasks
          ORDER BY created_at DESC
          LIMIT 50`
      )
    ]);

    const agentNodes = agentsResult.rows.map((agent) => ({
      id: agent.id,
      type: 'agent',
      label: agent.name,
      status: mapAgentStatus(agent.status),
      metadata: {
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      }
    }));

    const memoryNodes = memoriesResult.rows.map((memory) => ({
      id: memory.id,
      type: 'memory',
      label: memory.content.length > 80 ? `${memory.content.slice(0, 77)}...` : memory.content,
      status: mapMemoryStatus({
        created_at: memory.created_at
      }),
      metadata: {
        createdAt: memory.created_at,
        createdBy: (memory.metadata as { createdBy?: string } | null)?.createdBy ?? memory.agent_id,
        memoryType: 'long_term',
        expiresAt: null
      }
    }));

    const taskNodes = tasksResult.rows.map((task) => ({
      id: `task-${task.id}`,
      type: 'document',
      label: task.prompt.length > 80 ? `${task.prompt.slice(0, 77)}...` : task.prompt,
      status: task.status === 'completed' ? 'active' : task.status === 'pending' ? 'new' : 'expiring',
      metadata: {
        createdAt: task.created_at
      }
    }));

    const agentLinks = memoriesResult.rows.flatMap((memory) =>
      agentsResult.rows.map((agent) => ({
        source: agent.id,
        target: memory.id,
        relation: agent.id === memory.agent_id ? 'derived' : 'shared',
        strength: agent.id === memory.agent_id ? 0.9 : 0.35
      }))
    );

    const memoryConnections: {
      source: string;
      target: string;
      relation: 'similar';
      strength: number;
    }[] = [];

    const maxConnectionsPerMemory = 6;
    for (let i = 0; i < memoriesResult.rows.length; i += 1) {
      const sourceMemory = memoriesResult.rows[i];
      for (let offset = 1; offset <= maxConnectionsPerMemory; offset += 1) {
        const target = memoriesResult.rows[i + offset];
        if (!target) break;
        memoryConnections.push({
          source: sourceMemory.id,
          target: target.id,
          relation: 'similar',
          strength: Math.max(0.25, 0.6 - offset * 0.05)
        });
      }
    }

    const taskMemoryLinks = memoriesResult.rows
      .map((memory) => ({
        memoryId: memory.id,
        taskId: (memory.metadata as { taskId?: string } | null)?.taskId
      }))
      .filter((entry) => entry.taskId)
      .map((entry) => ({
        source: `task-${entry.taskId}`,
        target: entry.memoryId,
        relation: 'extends',
        strength: 0.55
      }));

    const taskLinks = tasksResult.rows.map((task) => ({
      source: task.agent_id,
      target: `task-${task.id}`,
      relation: task.status === 'completed' ? 'extends' : 'updated',
      strength: task.status === 'completed' ? 0.75 : 0.5
    }));

    res.json({
      nodes: [...agentNodes, ...memoryNodes, ...taskNodes],
      links: [...agentLinks, ...memoryConnections, ...taskLinks, ...taskMemoryLinks]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stream', async (_req, res, next) => {
  try {
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
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const unsubscribe = MemoryService.on((event) => {
      if (event.type === 'created') {
        const memory = event.memory;
        send({
          type: 'memory.created',
          memory: {
            ...memory,
            metadata: {
              ...(memory.metadata ?? {}),
              createdBy: (memory.metadata as { createdBy?: string } | null)?.createdBy ?? memory.agent_id
            }
          }
        });
      }
    });

    _req.on('close', () => {
      unsubscribe();
      safeEnd();
    });
  } catch (error) {
    next(error);
  }
});

export default router;
