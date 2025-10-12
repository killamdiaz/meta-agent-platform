import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db.js';
import { Agent, type AgentRecord } from './Agent.js';
import { MemoryService } from '../services/MemoryService.js';
import type { FetchResult } from '../services/InternetAccessModule.js';
import { metaController } from './MetaController.js';
import { webTool, type WebToolResult } from '../tools/webTool.js';
import { agentConfigService, type AgentConfigField } from '../services/AgentConfigService.js';
import { toolRuntime } from '../multiAgent/ToolRuntime.js';

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
  private readonly tools: Record<string, typeof webTool>;

  constructor() {
    this.tools = {
      web: webTool,
    };
  }

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

  private static deriveResearchQueries(text: string) {
    const queries = new Set<string>();
    const patterns: RegExp[] = [
      /research(?:\s+(?:on|about))?\s+([^.;\n]+)/gi,
      /look\s+up\s+([^.;\n]+)/gi,
      /search(?:\s+(?:for|about))?\s+([^.;\n]+)/gi,
      /fetch\s+(?:information|info)\s+(?:on|about)\s+([^.;\n]+)/gi,
      /find\s+(?:information|info)\s+(?:on|about)\s+([^.;\n]+)/gi,
      /what\s+can\s+you\s+tell\s+me\s+about\s+([^.?\n]+)/gi,
      /who\s+is\s+([^.?\n]+)/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const candidate = match[1]?.trim();
        if (candidate) {
          queries.add(candidate.replace(/^about\s+/i, '').trim());
        }
      }
    }

    const quoted = text.match(/"([^"]+)"/g) ?? [];
    for (const raw of quoted) {
      const cleaned = raw.replace(/"/g, '').trim();
      if (cleaned) {
        queries.add(cleaned);
      }
    }

    const normalized = Array.from(queries)
      .map((query) => query.replace(/[?!]+$/, '').slice(0, 160).trim())
      .filter((query) => query.length > 0);

    if (normalized.length === 0) {
      const lowered = text.toLowerCase();
      if (/(research|look up|find info|find information|investigate|analyze|what can you tell|who is|look into)/.test(lowered)) {
        const fallback = text.replace(/@[\w-]+/g, '').trim();
        if (fallback.length > 0) {
          normalized.push(fallback.slice(0, 160));
        }
      }
    }

    return normalized.slice(0, 3);
  }

  private static sanitizeSearchResults(result: WebToolResult['result']) {
    if (!Array.isArray(result)) {
      return [];
    }

    return result
      .filter((entry) => Boolean(entry?.url) && /^https?:\/\//i.test(entry.url))
      .map((entry) => ({
        title: entry.title?.trim() || entry.url,
        url: entry.url,
        snippet: entry.snippet?.trim() || entry.title?.trim() || '',
      }));
  }

  async allAgents(): Promise<AgentRecord[]> {
    const { rows } = await pool.query<AgentRecord>(
      `SELECT a.*, ac.agent_type, ac.summary AS config_summary, ac.schema AS config_schema, ac.config AS config_data
         FROM agents a
         LEFT JOIN agent_configs ac ON ac.agent_id = a.id
        ORDER BY a.created_at DESC`
    );
    return rows;
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const { rows } = await pool.query<AgentRecord>(
      `SELECT a.*, ac.agent_type, ac.summary AS config_summary, ac.schema AS config_schema, ac.config AS config_data
         FROM agents a
         LEFT JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE a.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async createAgent(payload: {
    name: string;
    role: string;
    tools: Record<string, unknown> | string;
    objectives: unknown;
    memory_context?: string;
    internet_access_enabled?: boolean;
    config?: {
      agentType: string;
      summary?: string;
      schema: AgentConfigField[];
      values?: Record<string, unknown>;
    };
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
    const agent = rows[0];
    if (payload.config) {
      const record = await agentConfigService.upsertAgentConfig(agent.id, {
        agentType: payload.config.agentType,
        summary: payload.config.summary,
        schema: payload.config.schema,
        values: payload.config.values ?? {},
      });
      agent.agent_type = record.agentType;
      agent.config_schema = record.configSchema;
      agent.config_data = record.values;
      agent.config_summary = record.description;
      await toolRuntime.refreshAgent(agent.id);
    }
    return agent;
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
      config?: {
        agentType?: string;
        summary?: string;
        schema?: AgentConfigField[];
        values?: Record<string, unknown>;
      };
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

    let agent: AgentRecord | null = null;

    if (assignments.length > 0) {
      const query = `
        UPDATE agents
           SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${assignments.length + 1}
         RETURNING *`;
      const { rows } = await pool.query<AgentRecord>(query, [...values, id]);
      agent = rows[0] ?? null;
    } else {
      agent = await this.getAgent(id);
    }

    if (!agent) {
      return null;
    }

    if (updates.config) {
      const schema = updates.config.schema ?? (Array.isArray(agent.config_schema) ? agent.config_schema : []);
      const valuesPayload = updates.config.values ?? (agent.config_data ?? {});
      const record = await agentConfigService.upsertAgentConfig(id, {
        agentType: updates.config.agentType ?? agent.agent_type ?? agent.role,
        summary: updates.config.summary ?? agent.config_summary ?? agent.role,
        schema,
        values: valuesPayload,
      });
      agent.agent_type = record.agentType;
      agent.config_schema = record.configSchema;
      agent.config_data = record.values;
      agent.config_summary = record.description;
      await toolRuntime.refreshAgent(id);
    }

    return agent;
  }

  async deleteAgent(id: string) {
    await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    toolRuntime.removeAgent(id);
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
      this.emitTaskEvent(task.id, {
        type: 'log',
        message: `${agent.name} received your request. Laying out a plan...`,
        agent: agentRecord,
      });

      let augmentedPrompt = task.prompt;
      const researchQueries = agent.internetEnabled ? AgentManager.deriveResearchQueries(task.prompt) : [];

      if (!agent.internetEnabled && researchQueries.length > 0) {
        this.emitTaskEvent(task.id, {
          type: 'log',
          message: `${agentRecord.name} cannot browse because internet access is disabled for this agent.`,
          agent: agentRecord,
        });
      }

      if (agent.internetEnabled) {
        const urls = AgentManager.extractUrls(task.prompt);
        const webSearchTool = this.tools.web;
        const researchNotes: string[] = [];
        const seenSources = new Set<string>();

        const appendResearchResult = (result: FetchResult) => {
          const normalizedUrl = result.url?.split('#')[0] ?? '';
          if (normalizedUrl && seenSources.has(normalizedUrl)) {
            return;
          }
          if (normalizedUrl) {
            seenSources.add(normalizedUrl);
          }
          const summary = result.summary ?? result.contentSnippet ?? '';
          const citationLine =
            result.citations && result.citations.length > 0 ? `Citations: ${result.citations.join(', ')}` : '';
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
        };

        const appendSearchSnippet = (result: { title: string; url: string; snippet: string }) => {
          if (seenSources.has(result.url)) {
            return;
          }
          seenSources.add(result.url);
          researchNotes.push(
            [`Source: ${result.title}`, `URL: ${result.url}`, result.snippet ? `Snippet: ${result.snippet}` : null]
              .filter((line): line is string => Boolean(line && line.trim().length > 0))
              .join('\n')
          );
        };

        for (const url of urls) {
          this.emitTaskEvent(task.id, {
            type: 'log',
            message: `${agent.name} is fetching ${url}...`,
            agent: agentRecord,
          });

          try {
            const result = await agent.fetch(url, { summarize: true, cite: true });
            appendResearchResult(result);

            if (result.usedFallback) {
              this.emitTaskEvent(task.id, {
                type: 'log',
                message: `Used fallback mirror to load ${url}`,
                agent: agentRecord,
              });
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
              if (!webSearchTool?.enabled) {
                this.emitTaskEvent(task.id, {
                  type: 'log',
                  message:
                    'I can’t browse the web in this mode. Enable web access by setting WEB_ENABLED=true in environment variables.',
                  agent: agentRecord,
                });
                continue;
              }

              try {
                const outcome = await webSearchTool.execute(fallbackQuery);
                const searchResults = AgentManager.sanitizeSearchResults(outcome.result);
                if (searchResults.length > 0) {
                  searchResults.forEach(appendSearchSnippet);
                  const [topResult] = searchResults;
                  if (topResult) {
                    this.emitTaskEvent(task.id, {
                      type: 'log',
                      message: `Following up with ${topResult.title || topResult.url}`,
                      agent: agentRecord,
                    });
                    try {
                      const followUp = await agent.fetch(topResult.url, { summarize: true, cite: true });
                      appendResearchResult(followUp);
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
                  }
                } else {
                  if (typeof outcome.result === 'string') {
                    this.emitTaskEvent(task.id, {
                      type: 'log',
                      message: outcome.result,
                      agent: agentRecord,
                    });
                  }
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

        if (urls.length === 0 && researchQueries.length > 0) {
          for (const query of researchQueries) {
            this.emitTaskEvent(task.id, {
              type: 'log',
              message: `${agent.name} is searching the web for "${query}"...`,
              agent: agentRecord,
            });

            if (!webSearchTool?.enabled) {
              this.emitTaskEvent(task.id, {
                type: 'log',
                message:
                  'I can’t browse the web in this mode. Enable web access by setting WEB_ENABLED=true in environment variables.',
                agent: agentRecord,
              });
              continue;
            }

            try {
              const outcome = await webSearchTool.execute(query);
              const searchResults = AgentManager.sanitizeSearchResults(outcome.result);
              if (searchResults.length > 0) {
                searchResults.forEach(appendSearchSnippet);
                const [topResult] = searchResults;
                if (topResult) {
                  this.emitTaskEvent(task.id, {
                    type: 'log',
                    message: `Following up with ${topResult.title || topResult.url}`,
                    agent: agentRecord,
                  });

                  try {
                    const followUp = await agent.fetch(topResult.url, { summarize: true, cite: true });
                    appendResearchResult(followUp);
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
                }
              } else {
                if (typeof outcome.result === 'string') {
                  this.emitTaskEvent(task.id, {
                    type: 'log',
                    message: outcome.result,
                    agent: agentRecord,
                  });
                }
                this.emitTaskEvent(task.id, {
                  type: 'log',
                  message: `No web results found for "${query}"`,
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
                message: `Web search failed for "${query}": ${searchMessage}`,
                agent: agentRecord,
              });
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
