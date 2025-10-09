import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db.js';
import { Agent, type AgentRecord } from './Agent.js';
import { MemoryService } from '../services/MemoryService.js';
import { metaController } from './MetaController.js';

export interface TaskRecord {
  id: string;
  agent_id: string;
  prompt: string;
  status: string;
  result: unknown;
  created_at: string;
  updated_at: string;
}

type TaskStreamBaseEvent = {
  agent?: AgentRecord;
};

export type TaskStreamEvent =
  | ({
      type: 'status';
      status: TaskRecord['status'];
      task: TaskRecord;
    } & TaskStreamBaseEvent)
  | ({
      type: 'token';
      token: string;
    } & TaskStreamBaseEvent)
  | ({
      type: 'log';
      message: string;
      detail?: Record<string, unknown>;
    } & TaskStreamBaseEvent)
  | ({
      type: 'complete';
      status: 'completed';
      task: TaskRecord;
    } & TaskStreamBaseEvent)
  | ({
      type: 'error';
      status: 'error';
      message: string;
      task?: TaskRecord;
    } & TaskStreamBaseEvent);

export class AgentManager {
  private taskListeners = new Map<string, Set<(event: TaskStreamEvent) => void>>();

  private static extractUrls(text: string) {
    const urlPattern = /https?:\/\/[^\s)]+/gi;
    const matches = text.match(urlPattern) ?? [];
    return Array.from(new Set(matches.map((match) => match.replace(/[.,]$/, '')))).slice(0, 3);
  }

  private static deriveSearchQuery(url: string) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length === 0) {
        return null;
      }
      const candidate = decodeURIComponent(segments[segments.length - 1])
        .replace(/[-_]+/g, ' ')
        .trim();
      return candidate.length > 0 ? candidate : null;
    } catch {
      return null;
    }
  }

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
    tools: Record<string, unknown> | string;
    objectives: unknown;
    memory_context?: string;
    internet_access_enabled?: boolean;
  }) {
    let toolsJson: string;
    if (typeof payload.tools === 'string') {
      try {
        JSON.parse(payload.tools);
        toolsJson = payload.tools;
      } catch {
        toolsJson = JSON.stringify({});
      }
    } else {
      toolsJson = JSON.stringify(payload.tools ?? {});
    }

    let objectivesJson: string;
    if (payload.objectives === undefined || payload.objectives === null) {
      objectivesJson = JSON.stringify([]);
    } else if (typeof payload.objectives === 'string') {
      try {
        const parsed = JSON.parse(payload.objectives);
        objectivesJson = JSON.stringify(parsed);
      } catch {
        objectivesJson = JSON.stringify([payload.objectives]);
      }
    } else {
      objectivesJson = JSON.stringify(payload.objectives);
    }

    const { rows } = await pool.query<AgentRecord>(
      `INSERT INTO agents(name, role, tools, objectives, memory_context, internet_access_enabled)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
        RETURNING *`,
      [
        payload.name,
        payload.role,
        toolsJson,
        objectivesJson,
        payload.memory_context ?? '',
        payload.internet_access_enabled ?? false,
      ]
    );
    return rows[0];
  }

  onTaskEvent(taskId: string, listener: (event: TaskStreamEvent) => void) {
    const listeners = this.taskListeners.get(taskId) ?? new Set<(event: TaskStreamEvent) => void>();
    listeners.add(listener);
    this.taskListeners.set(taskId, listeners);
    return () => {
      const current = this.taskListeners.get(taskId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.taskListeners.delete(taskId);
      }
    };
  }

  emitTaskEvent(taskId: string, event: TaskStreamEvent) {
    const listeners = this.taskListeners.get(taskId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[agent-manager] task listener error', error);
      }
    }
    if (event.type === 'complete' || event.type === 'error') {
      this.taskListeners.delete(taskId);
    }
  }

  async updateAgent(
    id: string,
    updates: {
      name?: string;
      role?: string;
      tools?: Record<string, unknown> | string;
      objectives?: unknown;
      memory_context?: string;
      status?: string;
      internet_access_enabled?: boolean;
    }
  ) {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      assignments.push(`name = $${assignments.length + 1}`);
      values.push(updates.name);
    }

    if (updates.role !== undefined) {
      assignments.push(`role = $${assignments.length + 1}`);
      values.push(updates.role);
    }

    if (updates.tools !== undefined) {
      let toolsJson: string;
      if (typeof updates.tools === 'string') {
        try {
          JSON.parse(updates.tools);
          toolsJson = updates.tools;
        } catch {
          toolsJson = JSON.stringify({});
        }
      } else {
        toolsJson = JSON.stringify(updates.tools ?? {});
      }
      assignments.push(`tools = $${assignments.length + 1}::jsonb`);
      values.push(toolsJson);
    }

    if (updates.objectives !== undefined) {
      let objectivesJson: string;
      if (updates.objectives === null) {
        objectivesJson = JSON.stringify([]);
      } else if (typeof updates.objectives === 'string') {
        try {
          const parsed = JSON.parse(updates.objectives);
          objectivesJson = JSON.stringify(parsed);
        } catch {
          objectivesJson = JSON.stringify([updates.objectives]);
        }
      } else {
        objectivesJson = JSON.stringify(updates.objectives);
      }
      assignments.push(`objectives = $${assignments.length + 1}::jsonb`);
      values.push(objectivesJson);
    }

    if (updates.memory_context !== undefined) {
      assignments.push(`memory_context = $${assignments.length + 1}`);
      values.push(updates.memory_context);
    }

    if (updates.status !== undefined) {
      assignments.push(`status = $${assignments.length + 1}`);
      values.push(updates.status);
    }

    if (updates.internet_access_enabled !== undefined) {
      assignments.push(`internet_access_enabled = $${assignments.length + 1}`);
      values.push(updates.internet_access_enabled);
    }

    if (assignments.length === 0) {
      return this.getAgent(id);
    }

    const query = `
      UPDATE agents
         SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${assignments.length + 1}
       RETURNING *`;
    const { rows } = await pool.query<AgentRecord>(query, [...values, id]);
    return rows[0] ?? null;
  }

  async deleteAgent(id: string) {
    await pool.query('DELETE FROM agents WHERE id = $1', [id]);
  }

  async addTask(agentId: string, prompt: string) {
    const { rows } = await pool.query<TaskRecord>(
      `INSERT INTO tasks(agent_id, prompt)
       VALUES ($1, $2)
       RETURNING *`,
      [agentId, prompt]
    );
    const task = rows[0];
    this.emitTaskEvent(task.id, { type: 'status', status: task.status as TaskRecord['status'], task });
    return task;
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

  async getTask(id: string) {
    const { rows } = await pool.query<TaskRecord>('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows[0] ?? null;
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
    let agentRecord: AgentRecord | null = null;

    await withTransaction(async (client) => {
      await this.markTaskRunning(client, task.id);
      await this.updateAgentStatus(client, task.agent_id, 'working');
    });

    task.status = 'working';

    try {
      agentRecord = await this.getAgent(task.agent_id);
      if (!agentRecord) {
        throw new Error(`Agent ${task.agent_id} not found`);
      }
      await metaController.onTaskScheduled(task);
      this.emitTaskEvent(task.id, { type: 'status', status: task.status as TaskRecord['status'], task, agent: agentRecord });

      const agent = this.instantiate(agentRecord);
      await metaController.onTaskStarted(task, { id: agent.id, name: agent.name });

      let augmentedPrompt = task.prompt;
      if (agent.internetEnabled) {
        const urls = AgentManager.extractUrls(task.prompt);
        const researchNotes: string[] = [];

        for (const url of urls) {
          this.emitTaskEvent(task.id, {
            type: 'log',
            message: `${agent.name} is fetching ${url}...`,
            agent: agentRecord,
          });

          try {
            const result = await agent.fetch(url, { summarize: true, cite: true });
            const summary = result.summary ?? result.contentSnippet ?? '';
            const citationLine = result.citations && result.citations.length > 0 ? `Citations: ${result.citations.join(', ')}` : '';
            const researchBlock = [
              `Source: ${result.title?.trim() || result.url}`,
              `URL: ${result.url}`,
              summary ? `Summary: ${summary}` : null,
              citationLine || null,
            ]
              .filter((line): line is string => Boolean(line && line.trim().length > 0))
              .join('\n');

            if (researchBlock) {
              researchNotes.push(researchBlock);
            }

            this.emitTaskEvent(task.id, {
              type: 'log',
              message: `Fetched ${result.title?.trim() || result.url}`,
              agent: agentRecord,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
            this.emitTaskEvent(task.id, {
              type: 'log',
              message: `Failed to fetch ${url}: ${message}`,
              agent: agentRecord,
            });

            const fallbackQuery = AgentManager.deriveSearchQuery(url);
            if (fallbackQuery) {
              this.emitTaskEvent(task.id, {
                type: 'log',
                message: `${agent.name} is searching the web for "${fallbackQuery}"...`,
                agent: agentRecord,
              });
              try {
                const searchResults = await agent.webSearch(fallbackQuery);
                const [topResult] = searchResults;
                if (topResult) {
                  this.emitTaskEvent(task.id, {
                    type: 'log',
                    message: `Following up with ${topResult.title || topResult.url}`,
                    agent: agentRecord,
                  });
                  try {
                    const followUp = await agent.fetch(topResult.url, { summarize: true, cite: true });
                    const summary = followUp.summary ?? followUp.contentSnippet ?? '';
                    const citationLine =
                      followUp.citations && followUp.citations.length > 0
                        ? `Citations: ${followUp.citations.join(', ')}`
                        : '';
                    const researchBlock = [
                      `Source: ${followUp.title?.trim() || followUp.url}`,
                      `URL: ${followUp.url}`,
                      summary ? `Summary: ${summary}` : null,
                      citationLine || null,
                    ]
                      .filter((line): line is string => Boolean(line && line.trim().length > 0))
                      .join('\n');

                    if (researchBlock) {
                      researchNotes.push(researchBlock);
                    }
                  } catch (followUpError) {
                    const followUpMessage =
                      followUpError instanceof Error
                        ? followUpError.message
                        : typeof followUpError === 'string'
                          ? followUpError
                          : 'Unknown error';
                    this.emitTaskEvent(task.id, {
                      type: 'log',
                      message: `Unable to retrieve ${topResult.url}: ${followUpMessage}`,
                      agent: agentRecord,
                    });
                  }
                } else {
                  this.emitTaskEvent(task.id, {
                    type: 'log',
                    message: `No web results found for "${fallbackQuery}"`,
                    agent: agentRecord,
                  });
                }
              } catch (searchError) {
                const searchMessage =
                  searchError instanceof Error
                    ? searchError.message
                    : typeof searchError === 'string'
                      ? searchError
                      : 'Unknown error';
                this.emitTaskEvent(task.id, {
                  type: 'log',
                  message: `Web search failed for "${fallbackQuery}": ${searchMessage}`,
                  agent: agentRecord,
                });
              }
            }
          }
        }

        if (researchNotes.length > 0) {
          const researchSummary = researchNotes.join('\n\n');
          augmentedPrompt = `${task.prompt}\n\n[Internet Research]\n${researchSummary}`;
        }
      }

      const thought = await agent.think(augmentedPrompt, (token) => {
        this.emitTaskEvent(task.id, { type: 'token', token });
      });
      const action = await agent.act({ id: task.id, prompt: task.prompt }, thought);
      const result = { thought, action };

      await withTransaction(async (client) => {
        await this.markTaskCompleted(client, task.id, result);
        await this.updateAgentStatus(client, task.agent_id, 'idle');
      });
      task.status = 'completed';
      task.result = result;

      await metaController.onTaskCompleted(task, result);
      this.emitTaskEvent(task.id, { type: 'complete', status: 'completed', task, agent: agentRecord });
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';

      await withTransaction(async (client) => {
        await this.markTaskFailed(client, task.id, {
          message: failure
        });
        await this.updateAgentStatus(client, task.agent_id, 'error');
      });
      task.status = 'error';
      task.result = { message: failure };
      await metaController.onTaskFailed(task, failure);
      this.emitTaskEvent(task.id, {
        type: 'error',
        status: 'error',
        message: failure,
        task,
        agent: agentRecord ?? undefined
      });
      throw error;
    }
  }
}

export const agentManager = new AgentManager();
