import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db.js';
import { Agent, type AgentRecord } from './Agent.js';
import { MemoryService } from '../services/MemoryService.js';

export interface TaskRecord {
  id: string;
  agent_id: string;
  prompt: string;
  status: string;
  result: unknown;
  created_at: string;
  updated_at: string;
}

export class AgentManager {
  async allAgents(): Promise<AgentRecord[]> {
    const { rows } = await pool.query<AgentRecord>('SELECT * FROM agents ORDER BY created_at DESC');
    return rows;
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const { rows } = await pool.query<AgentRecord>('SELECT * FROM agents WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async createAgent(payload: {
    name: string;
    role: string;
    tools: Record<string, unknown>;
    objectives: unknown;
    memory_context?: string;
  }) {
    const { rows } = await pool.query<AgentRecord>(
      `INSERT INTO agents(name, role, tools, objectives, memory_context)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.name, payload.role, payload.tools, payload.objectives, payload.memory_context ?? '']
    );
    return rows[0];
  }

  async addTask(agentId: string, prompt: string) {
    const { rows } = await pool.query<TaskRecord>(
      `INSERT INTO tasks(agent_id, prompt)
       VALUES ($1, $2)
       RETURNING *`,
      [agentId, prompt]
    );
    return rows[0];
  }

  async listTasks(status?: string) {
    if (status) {
      const { rows } = await pool.query<TaskRecord>(
        `SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC`,
        [status]
      );
      return rows;
    }
    const { rows } = await pool.query<TaskRecord>('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50');
    return rows;
  }

  instantiate(record: AgentRecord) {
    return new Agent(record, MemoryService);
  }

  async markTaskRunning(client: PoolClient, taskId: string) {
    await client.query(`UPDATE tasks SET status = 'working', updated_at = NOW() WHERE id = $1`, [taskId]);
  }

  async markTaskCompleted(client: PoolClient, taskId: string, result: unknown) {
    await client.query(
      `UPDATE tasks
          SET status = 'completed', result = $2, updated_at = NOW()
        WHERE id = $1`,
      [taskId, result]
    );
  }

  async markTaskFailed(client: PoolClient, taskId: string, error: unknown) {
    await client.query(
      `UPDATE tasks
          SET status = 'error', result = $2, updated_at = NOW()
        WHERE id = $1`,
      [taskId, error]
    );
  }

  async fetchPendingTasks(limit = 5) {
    const { rows } = await pool.query<TaskRecord>(
      `SELECT * FROM tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async updateAgentStatus(client: PoolClient, agentId: string, status: string) {
    await client.query(`UPDATE agents SET status = $2, updated_at = NOW() WHERE id = $1`, [agentId, status]);
  }

  async setAgentStatus(agentId: string, status: string) {
    await pool.query(`UPDATE agents SET status = $2, updated_at = NOW() WHERE id = $1`, [agentId, status]);
  }

  async appendMemory(agentId: string, entry: string, metadata: Record<string, unknown>) {
    await MemoryService.addMemory(agentId, entry, metadata);
  }

  async setAgentObjectives(agentId: string, objectives: string[]) {
    await pool.query(
      `UPDATE agents SET objectives = $2, updated_at = NOW() WHERE id = $1`,
      [agentId, objectives]
    );
  }

  async handleTask(task: TaskRecord) {
    await withTransaction(async (client) => {
      await this.markTaskRunning(client, task.id);
      await this.updateAgentStatus(client, task.agent_id, 'working');
    });

    try {
      const record = await this.getAgent(task.agent_id);
      if (!record) {
        throw new Error(`Agent ${task.agent_id} not found`);
      }
      const agent = this.instantiate(record);
      const thought = await agent.think(task.prompt);
      const action = await agent.act({ id: task.id, prompt: task.prompt }, thought);
      await withTransaction(async (client) => {
        await this.markTaskCompleted(client, task.id, { thought, action });
        await this.updateAgentStatus(client, task.agent_id, 'idle');
      });
    } catch (error) {
      await withTransaction(async (client) => {
        await this.markTaskFailed(client, task.id, {
          message: error instanceof Error ? error.message : 'unknown error'
        });
        await this.updateAgentStatus(client, task.agent_id, 'error');
      });
      throw error;
    }
  }
}

export const agentManager = new AgentManager();
