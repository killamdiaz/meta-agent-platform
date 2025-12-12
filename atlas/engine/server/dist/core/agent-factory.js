import { buildDynamicAgentFromSchema } from './dynamic-agent-builder.js';
import { bindClient } from './client-binder.js';
import { generateDynamicAgentSchema } from './meta-controller.js';
import { loadAgentFromDB, saveAgentToDB } from '../db/registry.js';
import { SlackBotAgent } from '../multiAgent/agents/SlackBotAgent.js';
import { RAGAgent } from '../multiAgent/agents/RAGAgent.js';
import { SlackToolAgent } from '../tools/slack/SlackAgent.js';
import { MailAgent } from '../tools/gmail/MailAgent.js';
import { NotionAgent } from '../tools/notion/NotionAgent.js';
import { AtlasAutomationAgent } from '../tools/atlas/AtlasAutomationAgent.js';
import { MemoryGraphAgent } from '../multiAgent/agents/MemoryGraphAgent.js';
import { TaskAgent } from '../multiAgent/agents/TaskAgent.js';
import { CalendarAgent } from '../multiAgent/agents/CalendarAgent.js';
import { FinanceAgent } from '../multiAgent/agents/FinanceAgent.js';
import { EmailMonitoringAgent } from '../multiAgent/agents/EmailMonitoringAgent.js';
import { AISummarizerAgent } from '../multiAgent/agents/AISummarizerAgent.js';
import { AnalyticsAgent } from '../multiAgent/agents/AnalyticsAgent.js';
import { MetaControllerAgent } from '../multiAgent/agents/MetaControllerAgent.js';
import { logAgentEvent } from './agent-logger.js';
import { coreOrchestrator } from '../multiAgent/index.js';
import { getAgentProfile } from '../registry/AgentProfileRegistry.js';
const SUPPORTED_AGENTS = {};
const BUILTIN_AGENT_DEFINITIONS = [
    {
        keys: ['SlackBotAgent', 'SlackBot', 'slack-bot'],
        ctor: SlackBotAgent,
    },
    {
        keys: ['RAGAgent', 'RAG', 'rag-agent'],
        ctor: RAGAgent,
    },
    {
        keys: ['SlackToolAgent', 'SlackTool', 'slack-tool'],
        ctor: SlackToolAgent,
    },
    {
        keys: ['SlackCustomerSupportAgent', 'SlackSupportAgent', 'SlackCustomerSupport'],
        ctor: SlackToolAgent,
    },
    {
        keys: ['MailAgent', 'GmailAgent', 'gmail', 'email-agent'],
        ctor: MailAgent,
    },
    {
        keys: ['NotionAgent', 'notion'],
        ctor: NotionAgent,
    },
    {
        keys: ['AtlasAutomationAgent', 'AtlasAgent', 'atlas'],
        ctor: AtlasAutomationAgent,
    },
    {
        keys: ['MemoryGraphAgent', 'memory-graph-agent'],
        ctor: MemoryGraphAgent,
    },
    {
        keys: ['TaskAgent', 'task-agent'],
        ctor: TaskAgent,
    },
    {
        keys: ['CalendarAgent', 'calendar-agent', 'google-calendar-agent'],
        ctor: CalendarAgent,
    },
    {
        keys: ['FinanceAgent', 'finance-agent'],
        ctor: FinanceAgent,
    },
    {
        keys: ['EmailMonitoringAgent', 'email-monitoring-agent', 'gmail-communication-agent'],
        ctor: EmailMonitoringAgent,
    },
    {
        keys: ['AISummarizerAgent', 'ai-summarizer-agent', 'docs-summarizer-agent'],
        ctor: AISummarizerAgent,
    },
    {
        keys: ['AnalyticsAgent', 'analytics-agent', 'data-analyst-agent'],
        ctor: AnalyticsAgent,
    },
    {
        keys: ['MetaControllerAgent', 'meta-controller-agent', 'atlas-meta-controller'],
        ctor: MetaControllerAgent,
    },
];
for (const { keys, ctor } of BUILTIN_AGENT_DEFINITIONS) {
    for (const key of keys) {
        SUPPORTED_AGENTS[key] = ctor;
    }
}
const dynamicAgentCache = new Map();
function resolveSupportedAgent(type) {
    if (!type)
        return undefined;
    if (SUPPORTED_AGENTS[type]) {
        return SUPPORTED_AGENTS[type];
    }
    const lower = type.toLowerCase();
    for (const [key, ctor] of Object.entries(SUPPORTED_AGENTS)) {
        if (key.toLowerCase() === lower) {
            return ctor;
        }
    }
    return undefined;
}
function cacheDynamicAgent(type, schema) {
    const DynamicAgent = buildDynamicAgentFromSchema(schema);
    dynamicAgentCache.set(type.toLowerCase(), DynamicAgent);
    return DynamicAgent;
}
function getCachedDynamicAgent(type) {
    return dynamicAgentCache.get(type.toLowerCase());
}
function extractCapabilities(config, fallback = []) {
    const raw = config.capabilities;
    if (Array.isArray(raw)) {
        return raw.filter((value) => typeof value === 'string');
    }
    return fallback;
}
function extractSafeActions(config, fallback = []) {
    const raw = config.safeActions;
    if (Array.isArray(raw)) {
        return raw
            .filter((value) => typeof value === 'string')
            .map((value) => value.toUpperCase());
    }
    return fallback;
}
function extractCommandScope(config, fallback = []) {
    const raw = config.commandScope;
    if (Array.isArray(raw)) {
        return raw.filter((value) => typeof value === 'string');
    }
    return fallback;
}
function extractPrivilegeLevel(config, fallback) {
    const raw = config.privilegeLevel;
    if (typeof raw === 'string') {
        const normalized = raw.toLowerCase();
        return normalized;
    }
    return fallback;
}
function extractBindings(config) {
    const raw = config.bindings;
    if (Array.isArray(raw)) {
        return raw.filter((value) => typeof value === 'string');
    }
    if (raw && typeof raw === 'object') {
        return Object.entries(raw)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([key]) => key);
    }
    return [];
}
function buildRegistrationPayload(agentType, config, schemaCapabilities) {
    const profile = getAgentProfile(agentType);
    const capabilities = new Set();
    const safeActions = new Set();
    const commandScope = new Set();
    for (const capability of profile?.capabilities ?? []) {
        capabilities.add(capability.toLowerCase());
    }
    for (const capability of schemaCapabilities ?? []) {
        if (typeof capability === 'string') {
            capabilities.add(capability.toLowerCase());
        }
    }
    for (const capability of extractCapabilities(config, [])) {
        capabilities.add(capability.toLowerCase());
    }
    for (const action of profile?.safeActions ?? []) {
        safeActions.add(action.toUpperCase());
    }
    for (const action of extractSafeActions(config, [])) {
        safeActions.add(action.toUpperCase());
    }
    for (const scope of profile?.commandScope ?? []) {
        commandScope.add(scope);
    }
    for (const scope of extractCommandScope(config, [])) {
        commandScope.add(scope);
    }
    if (safeActions.size === 0) {
        ['TASK', 'RESULT', 'INFO'].forEach((action) => safeActions.add(action));
    }
    // Ensure capabilities align with declared safe actions.
    if (safeActions.has('RESULT') || safeActions.has('INFO')) {
        capabilities.add('respond');
    }
    if (safeActions.has('TASK')) {
        capabilities.add('delegate');
    }
    if (safeActions.has('COMMAND')) {
        capabilities.add('command');
    }
    if (safeActions.has('BROADCAST') || safeActions.has('END')) {
        capabilities.add('coordinate');
    }
    if (capabilities.size === 0) {
        capabilities.add('respond');
    }
    const privilegeLevel = extractPrivilegeLevel(config, profile?.privilegeLevel ?? 'tool');
    return {
        capabilities: Array.from(capabilities),
        safeActions: Array.from(safeActions),
        commandScope: Array.from(commandScope),
        privilegeLevel,
    };
}
export async function createAgent(type, config) {
    const requestedType = type.trim();
    console.info(`[agent-factory] createAgent requested`, { type: requestedType });
    const BuiltInAgent = resolveSupportedAgent(requestedType);
    if (BuiltInAgent) {
        console.info(`[agent-factory] using built-in agent for "${requestedType}"`);
        const instance = new BuiltInAgent(config);
        await bindClient(instance, requestedType, config);
        const registration = buildRegistrationPayload(requestedType, config);
        coreOrchestrator.registerAgent(instance.id, {
            agentType: requestedType,
            capabilities: registration.capabilities,
            safeActions: registration.safeActions,
            commandScope: registration.commandScope,
            privilegeLevel: registration.privilegeLevel,
            bindings: extractBindings(config),
        });
        logAgentEvent(instance.id, `Agent instantiated (built-in: ${instance.constructor.name})`, {
            metadata: { stage: 'spawn', type: requestedType, source: 'factory' },
        });
        return instance;
    }
    const cached = getCachedDynamicAgent(requestedType);
    if (cached) {
        console.info(`[agent-factory] restored cached dynamic agent "${requestedType}"`);
        const instance = new cached(config);
        await bindClient(instance, requestedType, config);
        const registration = buildRegistrationPayload(requestedType, config);
        coreOrchestrator.registerAgent(instance.id, {
            agentType: requestedType,
            capabilities: registration.capabilities,
            safeActions: registration.safeActions,
            commandScope: registration.commandScope,
            privilegeLevel: registration.privilegeLevel,
            bindings: extractBindings(config),
        });
        logAgentEvent(instance.id, `Agent instantiated from cache`, {
            metadata: { stage: 'spawn', type: requestedType, source: 'factory', cache: true },
        });
        return instance;
    }
    const record = await loadAgentFromDB(requestedType);
    if (record) {
        console.info(`[agent-factory] loaded schema for "${requestedType}" from registry`, {
            schemaName: record.schema.name,
        });
        const DynamicAgent = cacheDynamicAgent(requestedType, record.schema);
        const instance = new DynamicAgent(config);
        await bindClient(instance, requestedType, config);
        const registration = buildRegistrationPayload(requestedType, config, record.schema.capabilities);
        coreOrchestrator.registerAgent(instance.id, {
            agentType: requestedType,
            capabilities: registration.capabilities,
            safeActions: registration.safeActions,
            commandScope: registration.commandScope,
            privilegeLevel: registration.privilegeLevel,
            bindings: extractBindings(config),
        });
        logAgentEvent(instance.id, `Agent instantiated from registry schema`, {
            metadata: {
                stage: 'spawn',
                type: requestedType,
                source: 'factory',
                schemaName: record.schema.name,
            },
        });
        return instance;
    }
    console.info(`[agent-factory] generating new schema for "${requestedType}" via meta-controller`);
    const generatedSchema = await generateDynamicAgentSchema(requestedType);
    await saveAgentToDB(requestedType, generatedSchema);
    console.info(`[agent-factory] persisted schema for "${requestedType}" to registry`);
    const DynamicAgent = cacheDynamicAgent(requestedType, generatedSchema);
    const instance = new DynamicAgent(config);
    await bindClient(instance, requestedType, config);
    const registration = buildRegistrationPayload(requestedType, config, generatedSchema.capabilities);
    coreOrchestrator.registerAgent(instance.id, {
        agentType: requestedType,
        capabilities: registration.capabilities,
        safeActions: registration.safeActions,
        commandScope: registration.commandScope,
        privilegeLevel: registration.privilegeLevel,
        bindings: extractBindings(config),
    });
    logAgentEvent(instance.id, `Agent generated and instantiated`, {
        metadata: {
            stage: 'spawn',
            type: requestedType,
            source: 'factory',
            schemaName: generatedSchema.name,
            generated: true,
        },
    });
    return instance;
}
