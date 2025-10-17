import { agentBroker, agentRegistry } from './index.js';
import { createAgent } from '../core/agent-factory.js';
import type { ToolAgentOptions } from '../tools/index.js';
import { pool } from '../db.js';
import type { AgentRecord } from '../core/Agent.js';
import type { BaseAgent } from './BaseAgent.js';
import { logAgentEvent } from '../core/agent-logger.js';

interface ToolAgentRow extends AgentRecord {
  agent_type: string;
  config_data: Record<string, unknown>;
}

export class ToolRuntime {
  private readonly agents = new Map<string, BaseAgent>();
  private readonly agentMetadata = new Map<string, { agentType: string }>();

  async initialise() {
    const { rows } = await pool.query<ToolAgentRow>(
      `SELECT a.*, ac.agent_type, ac.config AS config_data
         FROM agents a
         JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE ac.agent_type IS NOT NULL`
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
         JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE a.id = $1`,
      [agentId]
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
    const agent = await createAgent(row.agent_type, {
      ...options,
      agentType: row.agent_type,
    });
    agentRegistry.register(agent);
    this.agents.set(row.id, agent);
    this.agentMetadata.set(row.id, { agentType: row.agent_type });
    logAgentEvent(agent.id, `Tool agent registered (type=${row.agent_type})`, {
      metadata: { stage: 'register', agentType: row.agent_type, source: 'tool-runtime' },
    });
  }
}

export const toolRuntime = new ToolRuntime();
