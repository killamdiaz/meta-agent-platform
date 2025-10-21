import { Router } from 'express';
import { z } from 'zod';
import { agentManager } from '../core/AgentManager.js';
import { MemoryService } from '../services/MemoryService.js';
import { pool } from '../db.js';
import type { AgentRecord } from '../core/Agent.js';

const router = Router();

const configFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'password', 'textarea', 'select']),
  required: z.boolean().optional(),
  secure: z.boolean().optional(),
  options: z.array(z.string().min(1)).optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  tooltip: z.string().optional(),
  defaultValue: z.unknown().optional()
});

const createConfigSchema = z.object({
  agentType: z.string().min(1),
  summary: z.string().optional(),
  schema: z.array(configFieldSchema).min(1),
  values: z.record(z.unknown()).default({})
});

const updateConfigSchema = z.object({
  agentType: z.string().optional(),
  summary: z.string().optional(),
  schema: z.array(configFieldSchema).optional(),
  values: z.record(z.unknown()).optional()
});

const createAgentSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(2),
  tools: z.record(z.boolean()).default({}),
  objectives: z.array(z.string()).default([]),
  memory_context: z.string().optional(),
  internet_access_enabled: z.boolean().optional(),
  config: createConfigSchema.optional()
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createAgentSchema.parse(req.body);
    const agent = await agentManager.createAgent({
      name: payload.name,
      role: payload.role,
      tools: payload.tools,
      objectives: payload.objectives,
      memory_context: payload.memory_context ?? '',
      internet_access_enabled: payload.internet_access_enabled ?? false,
      config: payload.config
    });
    return res.status(201).json(serializeAgent(agent));
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const agents = await agentManager.allAgents();
    return res.json({ items: agents.map(serializeAgent) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    return res.json(serializeAgent(agent));
  } catch (error) {
    next(error);
  }
});

const updateAgentSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    tools: z.union([z.record(z.unknown()), z.string()]).optional(),
    objectives: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    memory_context: z.string().optional(),
    status: z.enum(['idle', 'working', 'error']).optional(),
    internet_access_enabled: z.boolean().optional(),
    config: updateConfigSchema.optional()
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update'
  });

const serializeAgent = (agent: AgentRecord) => {
  const { config_schema, config_data, config_summary, agent_type, ...rest } = agent;
  return {
    ...rest,
    agent_type,
    config_summary,
    config: {
      agentType: agent_type ?? agent.role,
      summary: config_summary ?? undefined,
      schema: Array.isArray(config_schema) ? config_schema : [],
      values: config_data ?? {}
    }
  };
};

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = updateAgentSchema.parse(req.body);
    const agent = await agentManager.updateAgent(id, payload);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    return res.json(serializeAgent(agent));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    await agentManager.deleteAgent(id);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/task', async (req, res, next) => {
  try {
    const body = z
      .object({
        prompt: z.string().min(1)
      })
      .parse(req.body);
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    const task = await agentManager.addTask(id, body.prompt);
    return res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/memory', async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    const limit = Number(req.query.limit) || 10;
    const [memoryRows, taskCounts] = await Promise.all([
      MemoryService.listMemories(id, limit),
      pool.query(
        `SELECT status, COUNT(*)::int as count
           FROM tasks
          WHERE agent_id = $1
          GROUP BY status`,
        [id]
      )
    ]);
    const memories = memoryRows.map((memory) => ({
      id: memory.id,
      agent_id: memory.agent_id,
      content: memory.content,
      metadata: {
        ...(memory.metadata ?? {}),
        createdBy: (memory.metadata as { createdBy?: string } | null)?.createdBy ?? memory.agent_id
      },
      created_at: memory.created_at,
      memory_type: memory.memory_type,
      expires_at: memory.expires_at
    }));

    return res.json({
      items: memories,
      taskCounts: Object.fromEntries(taskCounts.rows.map((row) => [row.status, row.count]))
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = z
      .object({
        status: z.enum(['idle', 'working', 'error'])
      })
      .parse(req.body);
    const agent = await agentManager.getAgent(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    await agentManager.setAgentStatus(id, body.status);
    const refreshed = await agentManager.getAgent(id);
    return res.json(serializeAgent({ ...(refreshed ?? agent), status: body.status }));
  } catch (error) {
    next(error);
  }
});

export default router;
