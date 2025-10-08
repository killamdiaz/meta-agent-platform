import { Router } from 'express';
import { pool } from '../db.js';

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

function mapMemoryStatus(createdAt: string): 'active' | 'new' | 'older' | 'forgotten' | 'expiring' {
  const created = new Date(createdAt).getTime();
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
        created_at: string;
      }>(
        `SELECT id, agent_id, content, created_at
           FROM agent_memory
          ORDER BY created_at DESC
          LIMIT 200`
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
      status: mapMemoryStatus(memory.created_at),
      metadata: {
        createdAt: memory.created_at
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

    const links = [
      ...memoriesResult.rows.map((memory) => ({
        source: memory.agent_id,
        target: memory.id,
        relation: 'derived',
        strength: 0.8
      })),
      ...tasksResult.rows.map((task) => ({
        source: task.agent_id,
        target: `task-${task.id}`,
        relation: task.status === 'completed' ? 'extends' : 'updated',
        strength: 0.6
      }))
    ];

    res.json({
      nodes: [...agentNodes, ...memoryNodes, ...taskNodes],
      links
    });
  } catch (error) {
    next(error);
  }
});

export default router;
