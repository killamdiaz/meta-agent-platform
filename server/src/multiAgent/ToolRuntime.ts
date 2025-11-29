import { agentBroker, agentRegistry } from './index.js';
import { createAgent } from '../core/agent-factory.js';
import type { ToolAgentOptions } from '../tools/index.js';
import { pool } from '../db.js';
import type { AgentRecord } from '../core/Agent.js';
import type { BaseAgent } from './BaseAgent.js';
import { logAgentEvent } from '../core/agent-logger.js';
import type { BaseAgentBridgeOptions } from './BaseAgent.js';

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

    await this.ensureDefaultAtlasAgents();
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
    this.registerAgentInstance(agent, row.agent_type);
  }

  private registerAgentInstance(agent: BaseAgent, agentType: string) {
    agentRegistry.register(agent);
    this.agents.set(agent.id, agent);
    this.agentMetadata.set(agent.id, { agentType });
    logAgentEvent(agent.id, `Tool agent registered (type=${agentType})`, {
      metadata: { stage: 'register', agentType, source: 'tool-runtime' },
    });
  }

  private hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  private resolveDefaultAtlasBridge(): BaseAgentBridgeOptions | null {
    const agentId =
      process.env.META_AGENT_ID ??
      process.env.NEXT_PUBLIC_META_AGENT_ID ??
      process.env.VITE_META_AGENT_ID ??
      null;
    const secret = process.env.META_AGENT_SECRET ?? null;
    const token =
      process.env.META_AGENT_JWT ??
      process.env.META_AGENT_TOKEN ??
      process.env.ATLAS_BRIDGE_TOKEN ??
      null;
    if (!agentId || !secret || !token) {
      return null;
    }
    return {
      agentId,
      secret,
      token,
      baseUrl: process.env.ATLAS_BRIDGE_BASE_URL,
    };
  }

  private async ensureDefaultAtlasAgents(): Promise<void> {
    const bridge = this.resolveDefaultAtlasBridge();
    if (!bridge) {
      if (this.agents.size === 0) {
        console.warn(
          '[tool-runtime] No tool agents registered and Atlas bridge credentials missing; Atlas OS prompts will be unavailable.',
        );
      }
      return;
    }

    const defaults: Array<{
      id: string;
      name: string;
      role: string;
      agentType: string;
      description: string;
    }> = [
      {
        id: 'atlas-task-agent',
        name: 'Atlas Task Agent',
        role: 'Atlas Task Agent',
        agentType: 'atlas-task-agent',
        description: 'Creates and retrieves tasks from Atlas OS.',
      },
      {
        id: 'atlas-workspace-agent',
        name: 'Atlas Workspace Agent',
        role: 'Atlas Workspace Agent',
        agentType: 'atlas-workspace-agent',
        description: 'Provides Atlas workspace summaries and module metadata.',
      },
      {
        id: 'atlas-invoices-agent',
        name: 'Atlas Invoices Agent',
        role: 'Atlas Invoices Agent',
        agentType: 'atlas-invoices-agent',
        description: 'Fetches invoices and financial summaries from Atlas OS.',
      },
      {
        id: 'atlas-contracts-agent',
        name: 'Atlas Contracts Agent',
        role: 'Atlas Contracts Agent',
        agentType: 'atlas-contracts-agent',
        description: 'Manages Atlas contract lookups and status updates.',
      },
      {
        id: 'atlas-notify-agent',
        name: 'Atlas Notify Agent',
        role: 'Atlas Notify Agent',
        agentType: 'atlas-notify-agent',
        description: 'Sends notifications into the Atlas OS activity feed.',
      },
    ];

    for (const entry of defaults) {
      if (this.hasAgent(entry.id)) {
        continue;
      }
      try {
        const agent = await createAgent(entry.agentType, {
          id: entry.id,
          name: entry.name,
          role: entry.role,
          description: entry.description,
          broker: agentBroker,
          registry: agentRegistry,
          connections: [],
          config: {},
          bridge,
        });
        this.registerAgentInstance(agent, entry.agentType);
      } catch (error) {
        console.warn(`[tool-runtime] Failed to bootstrap default Atlas agent ${entry.id}`, error);
      }
    }
  }
}

export const toolRuntime = new ToolRuntime();
