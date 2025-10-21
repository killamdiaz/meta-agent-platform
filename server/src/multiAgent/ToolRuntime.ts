import { agentBroker, agentRegistry } from './index.js';
import { createAgent } from '../core/agent-factory.js';
import type { ToolAgentOptions } from '../tools/index.js';
import { pool } from '../db.js';
import type { AgentRecord } from '../core/Agent.js';
import type { BaseAgent } from './BaseAgent.js';
import { logAgentEvent } from '../core/agent-logger.js';
import { agentConfigService } from '../services/AgentConfigService.js';

interface ToolAgentRow extends AgentRecord {
  agent_type: string | null;
  config_data: Record<string, unknown> | null;
}

export class ToolRuntime {
  private readonly agents = new Map<string, BaseAgent>();
  private readonly agentMetadata = new Map<string, { agentType: string }>();

  async initialise() {
    const { rows } = await pool.query<ToolAgentRow>(
      `SELECT a.*, ac.agent_type, ac.config AS config_data
         FROM agents a
         LEFT JOIN agent_configs ac ON ac.agent_id = a.id`
    );

    for (const row of rows) {
      try {
        await this.spawn(row);
      } catch (error) {
        console.error(`[tool-runtime] failed to spawn tool agent ${row.id}`, error);
      }
    }
  }

  async refreshAgent(agentId: string) {
    const existing = this.agents.get(agentId);
    if (existing) {
      existing.dispose();
      agentRegistry.unregister(agentId);
      this.agents.delete(agentId);
      this.agentMetadata.delete(agentId);
      logAgentEvent(agentId, 'Tool agent disposed for refresh', {
        metadata: { stage: 'dispose', source: 'tool-runtime' },
      });
    }
    const { rows } = await pool.query<ToolAgentRow>(
      `SELECT a.*, ac.agent_type, ac.config AS config_data
         FROM agents a
         LEFT JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE a.id = $1`,
      [agentId],
    );
    const row = rows[0];
    if (!row) return;
    await this.spawn(row);
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  describeAgents() {
    return Array.from(this.agents.values()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      connections: agent.connections,
      isTalking: agent.isTalking,
      agentType: this.agentMetadata.get(agent.id)?.agentType ?? agent.constructor.name,
    }));
  }

  removeAgent(agentId: string) {
    const existing = this.agents.get(agentId);
    if (!existing) return;
    existing.dispose();
    agentRegistry.unregister(agentId);
    this.agents.delete(agentId);
    this.agentMetadata.delete(agentId);
    logAgentEvent(agentId, 'Tool agent removed from runtime', {
      metadata: { stage: 'dispose', source: 'tool-runtime' },
    });
  }

  private async spawn(row: ToolAgentRow) {
    const agentType = this.inferAgentType(row);
    if (!agentType) {
      console.warn('[tool-runtime] unable to determine agent type; skipping spawn', {
        agentId: row.id,
        name: row.name,
      });
      return;
    }

    if (!row.agent_type) {
      try {
        await agentConfigService.upsertAgentConfig(row.id, {
          agentType,
          summary: row.role ?? row.name,
          schema: [],
          values: row.config_data ?? {},
        });
      } catch (error) {
        console.warn('[tool-runtime] failed to persist inferred agent config', {
          agentId: row.id,
          agentType,
          error,
        });
      }
    }

    const config = row.config_data ?? {};
    const options: ToolAgentOptions = {
      id: row.id,
      name: row.name,
      role: row.role,
      broker: agentBroker,
      registry: agentRegistry,
      connections: [],
      config,
      description: row.memory_context,
    };
    const agent = await createAgent(agentType, {
      ...options,
      agentType,
    });
    agentRegistry.register(agent);
    this.agents.set(row.id, agent);
    this.agentMetadata.set(row.id, { agentType });
    logAgentEvent(agent.id, `Tool agent registered (type=${agentType})`, {
      metadata: { stage: 'register', agentType, source: 'tool-runtime' },
    });
  }

  private inferAgentType(row: ToolAgentRow): string | null {
    const declared = row.agent_type?.trim();
    if (declared) {
      return declared;
    }

    const haystack = [
      row.name ?? '',
      row.role ?? '',
      row.memory_context ?? '',
    ]
      .join(' ')
      .toLowerCase();

    const hints: Array<{ match: RegExp; type: string }> = [
      { match: /\bemail\b.*monitor|\bgmail\b.*trigger|\binbox\b/i, type: 'EmailMonitoringAgent' },
      { match: /\btask\b|\bnotion\b|\bkanban\b/i, type: 'TaskAgent' },
      { match: /\bcalendar\b|\bmeeting\b/i, type: 'CalendarAgent' },
      { match: /\bfinance\b|\binvoice\b|\bbilling\b/i, type: 'FinanceAgent' },
      { match: /\banalytics?\b|\bdashboard\b|\bmetrics\b/i, type: 'AnalyticsAgent' },
      { match: /\bsummar(i[zs]e|y)\b|\bexecutive summary\b/i, type: 'AISummarizerAgent' },
      { match: /\bmemory\b|\bgraph\b/i, type: 'MemoryGraphAgent' },
      { match: /\bmeta[-\s]?controller\b|\bheartbeat\b/i, type: 'MetaControllerAgent' },
    ];

    for (const hint of hints) {
      if (hint.match.test(haystack)) {
        return hint.type;
      }
    }

    return null;
  }
}

export const toolRuntime = new ToolRuntime();
