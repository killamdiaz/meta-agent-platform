import { agentBroker } from '../multiAgent/index.js';
import { clonePipeline, } from './types.js';
const KEY_PROMPTS = {
    SlackTrigger: 'Slack connection uses configured integration; no token required.',
    SlackAgent: 'Slack connection uses configured integration; no token required.',
    GmailTrigger: 'This step needs your Gmail credentials. Provide the token to continue.',
    CronTrigger: 'No credentials required for scheduled runs.',
    SummarizerAgent: 'No credentials required.',
    NotionAgent: 'This step requires your Notion integration token. Enter it securely below.',
    DiscordAgent: 'This step needs your Discord bot token. Provide it below (it will NOT be stored).',
    EmailSenderAgent: 'Provide the SMTP or service API key required to send email. It will not be stored.',
    AtlasBridgeAgent: 'Atlas integration requires your Atlas Bridge JWT and shared secret. Enter them securely below.',
    AtlasContractsAgent: 'Atlas module access uses the main Atlas Bridge credentials already provided.',
    AtlasInvoicesAgent: 'Atlas module access uses the main Atlas Bridge credentials already provided.',
    AtlasTasksAgent: 'Atlas module access uses the main Atlas Bridge credentials already provided.',
    AtlasNotifyAgent: 'Atlas module access uses the main Atlas Bridge credentials already provided.',
    AtlasWorkspaceAgent: 'Atlas module access uses the main Atlas Bridge credentials already provided.',
    JiraAgent: 'Jira access requires your API token.',
    JiraTrigger: 'Jira trigger requires API token and site URL.',
};
const AGENTS_REQUIRING_KEYS = new Set([
    'NotionAgent',
    'DiscordAgent',
    'EmailSenderAgent',
    'AtlasBridgeAgent',
    'JiraAgent',
    'JiraTrigger',
]);
export class AutomationSessionManager {
    constructor(parser, events, repository) {
        this.parser = parser;
        this.events = events;
        this.repository = repository;
        this.sessions = new Map();
    }
    async processMessage({ sessionId, message }) {
        const trimmed = message.trim();
        if (!trimmed) {
            throw new Error('Message cannot be empty.');
        }
        const session = this.ensureSession(sessionId);
        if (this.isSaveCommand(trimmed)) {
            return this.handleSaveCommand(session, trimmed);
        }
        if (this.isLoadCommand(trimmed)) {
            return this.handleLoadCommand(session, trimmed);
        }
        const result = this.parser.parse(trimmed);
        this.updateSessionPipeline(session, result.pipeline);
        await this.persistAutomation(session);
        const pendingAgent = this.resolvePendingKey(session, result);
        if (pendingAgent) {
            this.events.emitStatus({
                sessionId: session.sessionId,
                status: 'awaiting_key',
                detail: { agent: pendingAgent },
            });
            return {
                status: 'awaiting_key',
                agent: pendingAgent,
                prompt: KEY_PROMPTS[pendingAgent],
            };
        }
        this.events.emitStatus({ sessionId: session.sessionId, status: 'success' });
        return {
            status: 'success',
            pipeline: clonePipeline(session.pipeline),
        };
    }
    async registerProvidedKey({ sessionId, agent }) {
        const session = this.ensureSession(sessionId);
        session.providedKeys.add(agent);
        if (session.pendingKeyFor === agent) {
            session.pendingKeyFor = undefined;
        }
        const pending = this.findRequiredKeys(session.pipeline).find((candidate) => !session.providedKeys.has(candidate));
        if (pending) {
            session.pendingKeyFor = pending;
            this.events.emitStatus({
                sessionId: session.sessionId,
                status: 'awaiting_key',
                detail: { agent: pending },
            });
            return {
                status: 'awaiting_key',
                agent: pending,
                prompt: KEY_PROMPTS[pending],
            };
        }
        this.events.emitStatus({ sessionId: session.sessionId, status: 'success' });
        return {
            status: 'success',
            pipeline: session.pipeline ? clonePipeline(session.pipeline) : undefined,
        };
    }
    resetSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        this.teardownGraph(session);
        this.sessions.delete(sessionId);
    }
    ensureSession(sessionId) {
        const existing = this.sessions.get(sessionId);
        if (existing) {
            return existing;
        }
        const state = {
            sessionId,
            pipeline: null,
            lastUpdated: Date.now(),
            providedKeys: new Set(),
            drawerOpened: false,
            graphNodeIds: new Set(),
            currentAutomationName: undefined,
        };
        this.sessions.set(sessionId, state);
        return state;
    }
    updateSessionPipeline(session, pipeline) {
        const cloned = clonePipeline(pipeline);
        if (!cloned) {
            throw new Error('Automation pipeline could not be prepared.');
        }
        session.pipeline = cloned;
        session.lastUpdated = Date.now();
        if (cloned.name) {
            session.currentAutomationName = cloned.name;
        }
        this.ensureDrawerOpen(session);
        this.events.emitPipeline({
            sessionId: session.sessionId,
            pipeline: clonePipeline(session.pipeline),
        });
        this.broadcastNodes(session);
        this.syncGraph(session);
    }
    ensureDrawerOpen(session) {
        if (session.drawerOpened) {
            return;
        }
        session.drawerOpened = true;
        this.events.emitDrawer({ sessionId: session.sessionId, isOpen: true });
    }
    broadcastNodes(session) {
        if (!session.pipeline)
            return;
        for (const node of session.pipeline.nodes) {
            this.events.emitNode({ sessionId: session.sessionId, node });
        }
        for (const edge of session.pipeline.edges) {
            this.events.emitEdge({ sessionId: session.sessionId, edge });
        }
    }
    syncGraph(session) {
        if (!session.pipeline)
            return;
        const pipeline = session.pipeline;
        const nextGraphNodes = new Set();
        const connectionMap = new Map();
        for (const edge of pipeline.edges) {
            const sourceId = this.toGraphNodeId(session.sessionId, edge.from);
            const targetId = this.toGraphNodeId(session.sessionId, edge.to);
            const existing = connectionMap.get(sourceId) ?? [];
            existing.push(targetId);
            connectionMap.set(sourceId, existing);
        }
        for (const node of pipeline.nodes) {
            const graphId = this.toGraphNodeId(session.sessionId, node.id);
            nextGraphNodes.add(graphId);
            const connections = connectionMap.get(graphId) ?? [];
            const descriptor = {
                name: this.describeNodeName(node),
                role: this.describeNodeRole(node),
                connections,
            };
            if (!session.graphNodeIds.has(graphId)) {
                try {
                    agentBroker.registerAgent({
                        id: graphId,
                        name: descriptor.name,
                        role: descriptor.role,
                        connections: descriptor.connections,
                    });
                }
                catch (error) {
                    console.warn('[automation-session] failed to register graph node, attempting update', {
                        error,
                        graphId,
                    });
                    agentBroker.updateAgent(graphId, descriptor);
                }
            }
            else {
                agentBroker.updateAgent(graphId, descriptor);
            }
        }
        for (const existingId of session.graphNodeIds) {
            if (!nextGraphNodes.has(existingId)) {
                agentBroker.unregisterAgent(existingId);
            }
        }
        session.graphNodeIds = nextGraphNodes;
    }
    teardownGraph(session) {
        for (const graphId of session.graphNodeIds) {
            agentBroker.unregisterAgent(graphId);
        }
        session.graphNodeIds.clear();
    }
    toGraphNodeId(sessionId, nodeId) {
        return `automation:${sessionId}:${nodeId}`;
    }
    describeNodeName(node) {
        switch (node.type) {
            case 'Trigger':
                return `${node.agent} Trigger`;
            case 'Processor':
                return `${node.agent}`;
            case 'Action':
                return `${node.agent} Action`;
            default:
                return node.agent;
        }
    }
    describeNodeRole(node) {
        return node.type;
    }
    async persistAutomation(session) {
        if (!session.pipeline) {
            return;
        }
        const name = this.ensurePipelineHasName(session);
        try {
            await this.repository.saveAutomation(name, session.pipeline);
            session.currentAutomationName = name;
            session.pipeline.name = name;
        }
        catch (error) {
            console.error('[automation-session] failed to persist automation', {
                sessionId: session.sessionId,
                name,
                error,
            });
        }
    }
    ensurePipelineHasName(session) {
        if (!session.pipeline) {
            return this.generateDefaultName();
        }
        const existing = session.pipeline.name?.trim() || session.currentAutomationName?.trim();
        if (existing) {
            session.pipeline.name = existing;
            return existing;
        }
        const generated = this.generateDefaultName(session.pipeline);
        session.pipeline.name = generated;
        return generated;
    }
    generateDefaultName(pipeline) {
        const trigger = pipeline?.nodes.find((node) => node.type === 'Trigger')?.agent.replace(/Trigger$/, '') ?? 'Automation';
        const actions = pipeline?.nodes
            .filter((node) => node.type === 'Action')
            .map((node) => node.agent.replace(/Agent$/, '')) ?? [];
        const actionPart = actions.length ? actions.join('-') : 'Flow';
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12);
        return `${trigger}-${actionPart}-${timestamp}`;
    }
    resolvePendingKey(session, result) {
        const required = result.requiresKeys.find((agent) => !session.providedKeys.has(agent));
        if (!required) {
            session.pendingKeyFor = undefined;
            return null;
        }
        session.pendingKeyFor = required;
        return required;
    }
    isSaveCommand(input) {
        return /^save\b/i.test(input) || /\bsave this as\b/i.test(input);
    }
    isLoadCommand(input) {
        return /^load\b/i.test(input);
    }
    extractQuotedName(input) {
        const quoted = input.match(/["“”']([^"“”']+)["“”']/);
        if (quoted && quoted[1]?.trim()) {
            return quoted[1].trim();
        }
        const loose = input.replace(/^(save|load)\b/i, '').replace(/\bas\b/i, '').trim();
        if (loose) {
            return loose;
        }
        return null;
    }
    async handleSaveCommand(session, input) {
        if (!session.pipeline) {
            throw new Error('Build an automation before saving.');
        }
        const name = this.extractQuotedName(input);
        if (!name) {
            throw new Error('Provide a name, e.g. Save this as "Weekly Digest".');
        }
        const payload = clonePipeline(session.pipeline);
        if (!payload) {
            throw new Error('Automation pipeline is empty.');
        }
        payload.name = name;
        await this.repository.saveAutomation(name, payload);
        session.pipeline.name = name;
        session.currentAutomationName = name;
        this.events.emitStatus({ sessionId: session.sessionId, status: 'saved', detail: { name } });
        return {
            status: 'saved',
            name,
        };
    }
    async handleLoadCommand(session, input) {
        const name = this.extractQuotedName(input);
        if (!name) {
            throw new Error('Provide the automation name, e.g. Load "Invoice Notifier".');
        }
        const pipeline = await this.repository.loadAutomation(name);
        if (!pipeline) {
            throw new Error(`Automation "${name}" was not found.`);
        }
        this.updateSessionPipeline(session, pipeline);
        this.events.emitStatus({ sessionId: session.sessionId, status: 'loaded', detail: { name } });
        return {
            status: 'loaded',
            pipeline: clonePipeline(session.pipeline),
        };
    }
    findRequiredKeys(pipeline) {
        if (!pipeline)
            return [];
        const required = new Set();
        for (const node of pipeline.nodes) {
            if (AGENTS_REQUIRING_KEYS.has(node.agent)) {
                required.add(node.agent);
            }
        }
        return Array.from(required);
    }
}
