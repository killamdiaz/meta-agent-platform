import { agentBroker, agentRegistry } from './index.js';
import { createAgent } from '../core/agent-factory.js';
import { pool } from '../db.js';
import { logAgentEvent } from '../core/agent-logger.js';
export class ToolRuntime {
    constructor() {
        this.agents = new Map();
        this.agentMetadata = new Map();
    }
    async initialise() {
        const { rows } = await pool.query(`SELECT a.*, ac.agent_type, ac.config AS config_data
         FROM agents a
         JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE ac.agent_type IS NOT NULL`);
        for (const row of rows) {
            try {
                await this.spawn(row);
            }
            catch (error) {
                console.error(`[tool-runtime] failed to spawn tool agent ${row.id}`, error);
            }
        }
    }
    async refreshAgent(agentId) {
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
        const { rows } = await pool.query(`SELECT a.*, ac.agent_type, ac.config AS config_data
         FROM agents a
         JOIN agent_configs ac ON ac.agent_id = a.id
        WHERE a.id = $1`, [agentId]);
        const row = rows[0];
        if (!row)
            return;
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
    removeAgent(agentId) {
        const existing = this.agents.get(agentId);
        if (!existing)
            return;
        existing.dispose();
        agentRegistry.unregister(agentId);
        this.agents.delete(agentId);
        this.agentMetadata.delete(agentId);
        logAgentEvent(agentId, 'Tool agent removed from runtime', {
            metadata: { stage: 'dispose', source: 'tool-runtime' },
        });
    }
    async spawn(row) {
        const config = row.config_data ?? {};
        const options = {
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
    registerAgentInstance(agent, agentType) {
        agentRegistry.register(agent);
        this.agents.set(agent.id, agent);
        this.agentMetadata.set(agent.id, { agentType });
        logAgentEvent(agent.id, `Tool agent registered (type=${agentType})`, {
            metadata: { stage: 'register', agentType, source: 'tool-runtime' },
        });
    }
}
export const toolRuntime = new ToolRuntime();
