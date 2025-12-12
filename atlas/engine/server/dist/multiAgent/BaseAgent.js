import { MemoryService } from '../services/MemoryService.js';
import { getCoreOrchestrator } from '../core/orchestrator-registry.js';
import { routeMessage } from '../llm/router.js';
import { AtlasBridgeClient, } from '../core/atlas/BridgeClient.js';
const DEFAULT_MODEL = 'gpt-4.1-mini';
class AsyncQueue {
    constructor() {
        this.queue = [];
        this.waiting = [];
        this.closed = false;
    }
    push(item) {
        if (this.closed) {
            return;
        }
        const resolver = this.waiting.shift();
        if (resolver) {
            resolver(item);
            return;
        }
        this.queue.push(item);
    }
    next() {
        if (this.queue.length > 0) {
            return Promise.resolve(this.queue.shift());
        }
        if (this.closed) {
            return Promise.resolve(undefined);
        }
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        while (this.waiting.length) {
            const resolver = this.waiting.shift();
            resolver?.(undefined);
        }
        this.queue.length = 0;
    }
}
export class BaseAgent {
    constructor(options) {
        this.client = null;
        this.memory = [];
        this.inbox = new AsyncQueue();
        this.teardownCallbacks = [];
        this.connectionSet = new Set();
        this.followUpQueue = [];
        this.processingLoopActive = false;
        this.disposed = false;
        this.autonomyTimer = null;
        this.talking = false;
        this.flushingFollowUps = false;
        this.atlasBridgeClient = null;
        this.id = options.id;
        this.name = options.name;
        this.role = options.role;
        this.description = options.description;
        this.broker = options.broker;
        this.registry = options.registry;
        this.memoryLimit = options.memoryLimit ?? 200;
        this.model = options.model ?? DEFAULT_MODEL;
        this.onStateChange = options.onStateChange;
        this.initialiseConnections(options.connections);
        this.registerTopicAlias(this.name);
        this.registerTopicAlias(this.role);
        if (options.aliases) {
            for (const alias of options.aliases) {
                this.registerTopicAlias(alias);
            }
        }
        if (options.bridge) {
            this.configureAtlasBridge(options.bridge);
        }
    }
    get isTalking() {
        return this.talking;
    }
    get connections() {
        return Array.from(this.connectionSet).filter(Boolean);
    }
    configureAtlasBridge(options) {
        const { agentId, ...rest } = options;
        const candidateId = String(agentId ?? '').trim();
        const resolvedAgentId = candidateId.length > 0 && candidateId.toLowerCase() !== 'undefined' ? candidateId : this.id;
        try {
            const clientOptions = {
                ...rest,
                agentId: resolvedAgentId,
            };
            this.atlasBridgeClient = new AtlasBridgeClient(clientOptions);
            this.bridgeAgentId = resolvedAgentId;
        }
        catch (error) {
            console.warn(`[agent:${this.id}] failed to initialise Atlas bridge client`, {
                error,
                agentId: resolvedAgentId,
            });
            this.atlasBridgeClient = null;
            this.bridgeAgentId = undefined;
        }
    }
    hasAtlasBridge() {
        return this.atlasBridgeClient !== null;
    }
    getAtlasBridgeAgentId() {
        return this.bridgeAgentId;
    }
    setAtlasBridgeTokenProvider(provider) {
        this.atlasBridgeClient?.setTokenProvider(provider);
    }
    updateAtlasBridgeToken(token) {
        if (!this.atlasBridgeClient)
            return;
        this.atlasBridgeClient.setToken(token);
    }
    clearAtlasBridgeCache(pathPrefix) {
        this.atlasBridgeClient?.clearCache(pathPrefix);
    }
    getMessageEventType(message) {
        const metadata = message.metadata ?? {};
        if (!metadata || typeof metadata !== 'object') {
            return null;
        }
        const candidate = (typeof metadata.eventType === 'string'
            ? metadata.eventType
            : undefined) ??
            (typeof metadata.intent === 'string'
                ? metadata.intent
                : undefined);
        if (!candidate) {
            return null;
        }
        const trimmed = candidate.trim().toLowerCase();
        return trimmed.length > 0 ? trimmed : null;
    }
    getMessagePayload(message) {
        const metadata = message.metadata ?? {};
        if (metadata && typeof metadata === 'object' && 'payload' in metadata) {
            return metadata.payload;
        }
        return undefined;
    }
    async callBridge(options) {
        const bridge = this.ensureAtlasBridge();
        return bridge.request(options);
    }
    async callAtlas(path, method = 'GET', body, options) {
        const request = {
            path,
            method,
            ...(options ?? {}),
        };
        if (body !== undefined) {
            request.body = body;
        }
        return this.callBridge(request);
    }
    async requestHelp(targetAgentId, query, metadata) {
        if (!targetAgentId || targetAgentId === this.id) {
            throw new Error('requestHelp requires a different target agent id.');
        }
        const content = typeof query === 'string' ? query : JSON.stringify(query, null, 2);
        const payloadMetadata = typeof query === 'string'
            ? { prompt: query }
            : { ...query };
        const mergedMetadata = {
            eventType: 'request_context',
            intent: 'request_context',
            requestedBy: this.id,
            ...(metadata ?? {}),
            payload: payloadMetadata,
        };
        if (this.bridgeAgentId) {
            mergedMetadata.bridgeAgentId = this.bridgeAgentId;
        }
        return this.sendMessage(targetAgentId, 'task', content, mergedMetadata);
    }
    ensureAtlasBridge() {
        if (!this.atlasBridgeClient) {
            throw new Error(`Agent ${this.id} is not configured with an Atlas bridge client.`);
        }
        return this.atlasBridgeClient;
    }
    receiveMessage(message) {
        this.noteConnection(message.from);
        this.recordMemory(message, 'incoming');
        this.inbox.push(message);
        this.handleAutonomySignals(message);
        void this.ensureProcessingLoop();
    }
    async sendMessage(to, type, content, metadata) {
        const orchestrator = getCoreOrchestrator();
        const governed = {
            from: this.id,
            to,
            type: this.mapAgentMessageType(type),
            intent: typeof metadata?.intent === 'string' ? metadata.intent : type,
            content,
            confidence: typeof metadata?.confidence === 'number' ? metadata.confidence : undefined,
            tokens: typeof metadata?.tokens === 'number' ? metadata.tokens : undefined,
            metadata: metadata,
            requiredCapabilities: Array.isArray(metadata?.requiredCapabilities)
                ? metadata?.requiredCapabilities
                : undefined,
            requiredBindings: Array.isArray(metadata?.requiredBindings)
                ? metadata?.requiredBindings
                : undefined,
            conversationId: typeof metadata?.conversationId === 'string' ? metadata.conversationId : undefined,
        };
        const published = await orchestrator.broadcast(governed);
        if (!published) {
            throw new Error('Message blocked by conversation governor.');
        }
        const message = {
            id: published.id,
            timestamp: published.timestamp,
            from: published.from,
            to: published.to,
            type: published.type,
            content: published.content,
            metadata: published.metadata,
        };
        this.noteConnection(to);
        this.recordMemory(message, 'outgoing');
        this.emitTalkingState(message, 'outgoing', true);
        this.emitLinkActivity({
            targetId: to,
            direction: 'outgoing',
            isActive: true,
            messageId: message.id,
            timestamp: new Date().toISOString(),
        });
        const deactivate = setTimeout(() => {
            this.emitTalkingState(message, 'outgoing', false);
            this.emitLinkActivity({
                targetId: to,
                direction: 'outgoing',
                isActive: false,
                messageId: message.id,
                timestamp: new Date().toISOString(),
            });
        }, 250);
        this.teardownCallbacks.push(() => clearTimeout(deactivate));
        return message;
    }
    mapAgentMessageType(type) {
        switch (type) {
            case 'response':
                return 'RESULT';
            case 'task':
                return 'TASK';
            default:
                return 'INFO';
        }
    }
    getMemorySnapshot() {
        return this.memory.map((entry) => ({ ...entry, message: { ...entry.message } }));
    }
    startAutonomy(intervalMs = 5000) {
        if (this.autonomyTimer)
            return;
        this.autonomyTimer = setInterval(() => {
            void this.think().catch((error) => {
                console.error(`[agent:${this.id}] autonomous thinking failed`, error);
            });
        }, intervalMs);
        this.teardownCallbacks.push(() => {
            if (this.autonomyTimer) {
                clearInterval(this.autonomyTimer);
                this.autonomyTimer = null;
            }
        });
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        if (this.autonomyTimer) {
            clearInterval(this.autonomyTimer);
            this.autonomyTimer = null;
        }
        this.inbox.close();
        while (this.teardownCallbacks.length) {
            const cb = this.teardownCallbacks.pop();
            cb?.();
        }
    }
    async think() {
        await this.flushFollowUps();
    }
    connectTo(target) {
        if (!target || target === this.id || target === '*' || target === 'broadcast')
            return;
        if (!this.connectionSet.has(target)) {
            this.connectionSet.add(target);
            this.pushConnectionUpdate();
        }
    }
    disconnectFrom(target) {
        if (!target || target === this.id)
            return;
        if (this.connectionSet.delete(target)) {
            this.pushConnectionUpdate();
        }
    }
    setConnections(targets) {
        this.connectionSet.clear();
        for (const target of targets) {
            if (target && target !== this.id) {
                this.connectionSet.add(target);
            }
        }
        this.pushConnectionUpdate();
    }
    registerTopicAlias(topic) {
        const normalized = this.normaliseTopicValue(topic);
        if (!normalized)
            return;
        this.broker.registerTopicAlias(this.id, normalized.original);
        if (normalized.compact && normalized.compact !== normalized.original) {
            this.broker.registerTopicAlias(this.id, normalized.compact);
        }
    }
    unregisterTopicAlias(topic) {
        const normalized = this.normaliseTopicValue(topic);
        if (!normalized)
            return;
        this.broker.unregisterTopicAlias(this.id, normalized.original);
        if (normalized.compact && normalized.compact !== normalized.original) {
            this.broker.unregisterTopicAlias(this.id, normalized.compact);
        }
    }
    normaliseTopicValue(topic) {
        const original = typeof topic === 'string' ? topic.trim() : '';
        if (!original) {
            return null;
        }
        const compact = original.replace(/\s+/g, '');
        if (!compact || compact === original) {
            return { original };
        }
        return { original, compact };
    }
    async queueFollowUp(to, type, content, metadata) {
        this.followUpQueue.push({ to, type, content, metadata });
        await this.flushFollowUps();
    }
    async generateLLMReply(options) {
        const systemPrompt = options.systemPrompt ??
            [
                `You are Agent ${this.id}, part of a team of collaborating AI agents working together to solve problems.`,
                'You receive both short-term and long-term memories as context—treat them as authoritative and leverage them when replying.',
                'Do not claim you lack memory or cannot remember; instead, draw from the provided memories or ask for clarification if details are missing.',
            ].join(' ');
        const userPromptLines = [
            `You just received a message from Agent ${options.from}:`,
            `"${options.content}"`,
            '',
            'Your job is to reply with relevant insight, answer, or a concise follow-up question if you require more information.',
            'Keep the response concise and goal-oriented.',
        ];
        if (options.context) {
            userPromptLines.push('', 'Additional context:', options.context);
        }
        if (options.metadata && Object.keys(options.metadata).length) {
            userPromptLines.push('', 'Metadata:', JSON.stringify(options.metadata, null, 2));
        }
        const reply = await routeMessage({
            prompt: userPromptLines.join('\n'),
            context: systemPrompt,
            intent: 'agent_comms',
        });
        if (!reply) {
            return 'No response generated.';
        }
        return reply;
    }
    initialiseConnections(initial) {
        if (Array.isArray(initial)) {
            for (const entry of initial) {
                if (entry && entry !== this.id) {
                    this.connectionSet.add(entry);
                }
            }
        }
    }
    async ensureProcessingLoop() {
        if (this.processingLoopActive)
            return;
        this.processingLoopActive = true;
        try {
            while (!this.disposed) {
                const message = await this.inbox.next();
                if (!message) {
                    break;
                }
                this.emitTalkingState(message, 'incoming', true);
                this.emitLinkActivity({
                    targetId: message.from,
                    direction: 'incoming',
                    isActive: true,
                    messageId: message.id,
                    timestamp: new Date().toISOString(),
                });
                try {
                    await this.processMessage(message);
                }
                catch (error) {
                    console.error(`[agent:${this.id}] failed to process message ${message.id}`, error);
                }
                finally {
                    this.emitTalkingState(message, 'incoming', false);
                    this.emitLinkActivity({
                        targetId: message.from,
                        direction: 'incoming',
                        isActive: false,
                        messageId: message.id,
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }
        finally {
            this.processingLoopActive = false;
        }
    }
    recordMemory(message, direction) {
        const entry = {
            direction,
            message: { ...message },
            recordedAt: new Date().toISOString(),
        };
        this.memory.push(entry);
        if (this.memory.length > this.memoryLimit) {
            this.memory.splice(0, this.memory.length - this.memoryLimit);
        }
        const summary = `${direction === 'incoming' ? 'Received' : 'Sent'} ${message.type} message ${direction === 'incoming' ? 'from' : 'to'} ${direction === 'incoming' ? message.from : message.to}: ${message.content}`;
        void MemoryService.addMemory(this.id, summary, {
            direction,
            messageId: message.id,
            type: message.type,
            to: message.to,
            from: message.from,
            metadata: message.metadata ?? {},
            memoryType: 'short_term',
            retention: 'short_term',
            category: 'conversation',
            ephemeral: true,
            importance: 'low',
        }).catch((error) => {
            console.error('[agent-memory] failed to persist memory', { agentId: this.id, messageId: message.id, error });
        });
    }
    emitTalkingState(message, direction, isTalking) {
        this.talking = isTalking;
        this.dispatchStateChange({
            message,
            direction,
            isTalking,
        });
    }
    emitLinkActivity(activity) {
        this.dispatchStateChange({
            linkActivity: activity,
        });
    }
    dispatchStateChange(update) {
        const payload = {
            agentId: this.id,
            ...update,
        };
        this.onStateChange?.(payload);
        this.broker.emitStateChange(payload);
    }
    noteConnection(target) {
        if (!target || target === this.id || target === '*' || target === 'broadcast')
            return;
        if (!this.connectionSet.has(target)) {
            this.connectionSet.add(target);
            this.pushConnectionUpdate();
        }
    }
    pushConnectionUpdate() {
        this.broker.updateAgent(this.id, {
            connections: this.connections,
            isTalking: this.talking,
        });
    }
    handleAutonomySignals(message) {
        const metadata = message.metadata;
        if (!metadata || typeof metadata !== 'object')
            return;
        const autonomy = metadata.autonomy;
        if (!autonomy || typeof autonomy !== 'object')
            return;
        const ensureStrings = (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
        const askAgents = ensureStrings(autonomy.askAgents);
        const escalateTo = ensureStrings(autonomy.escalateTo);
        const needsContextFrom = ensureStrings(autonomy.needsContextFrom);
        const targets = new Set();
        for (const target of [...askAgents, ...escalateTo, ...needsContextFrom]) {
            if (target && target !== this.id) {
                targets.add(target);
            }
        }
        if (!targets.size) {
            return;
        }
        const snippet = message.content.length > 140 ? `${message.content.slice(0, 137)}…` : message.content;
        for (const target of targets) {
            const rationale = escalateTo.includes(target)
                ? `Escalating to ${target} for validation.`
                : needsContextFrom.includes(target)
                    ? `Requesting missing context from ${target}.`
                    : `Inviting ${target} to contribute.`;
            void this.queueFollowUp(target, 'question', `${rationale}\n\nTopic: ${snippet}`, {
                origin: this.id,
                inReplyTo: message.id,
                rationale: 'autonomy:metadata-hint',
            });
        }
    }
    async flushFollowUps() {
        if (this.flushingFollowUps) {
            return;
        }
        this.flushingFollowUps = true;
        try {
            while (this.followUpQueue.length > 0) {
                const next = this.followUpQueue.shift();
                if (!next) {
                    continue;
                }
                await this.sendMessage(next.to, next.type, next.content, next.metadata);
            }
        }
        finally {
            this.flushingFollowUps = false;
        }
    }
}
