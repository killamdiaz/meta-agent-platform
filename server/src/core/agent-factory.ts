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
import type { BaseAgent, BaseAgentOptions } from '../multiAgent/BaseAgent.js';
import type { AgentSchema } from '../types/agents.js';
import { logAgentEvent } from './agent-logger.js';
import { coreOrchestrator } from '../multiAgent/index.js';
import { getAgentProfile, type PrivilegeLevel } from '../registry/AgentProfileRegistry.js';

type AgentConstructor = new (options: any) => BaseAgent;

const SUPPORTED_AGENTS: Record<string, AgentConstructor> = {};

const BUILTIN_AGENT_DEFINITIONS: Array<{ keys: string[]; ctor: AgentConstructor }> = [
  {
    keys: ['SlackBotAgent', 'SlackBot', 'slack-bot'],
    ctor: SlackBotAgent as AgentConstructor,
  },
  {
    keys: ['RAGAgent', 'RAG', 'rag-agent'],
    ctor: RAGAgent as AgentConstructor,
  },
  {
    keys: ['SlackToolAgent', 'SlackTool', 'slack-tool'],
    ctor: SlackToolAgent as AgentConstructor,
  },
  {
    keys: ['SlackCustomerSupportAgent', 'SlackSupportAgent', 'SlackCustomerSupport'],
    ctor: SlackToolAgent as AgentConstructor,
  },
  {
    keys: ['MailAgent', 'GmailAgent', 'gmail', 'email-agent'],
    ctor: MailAgent as AgentConstructor,
  },
  {
    keys: ['NotionAgent', 'notion'],
    ctor: NotionAgent as AgentConstructor,
  },
  {
    keys: ['AtlasAutomationAgent', 'AtlasAgent', 'atlas'],
    ctor: AtlasAutomationAgent as AgentConstructor,
  },
  {
    keys: ['MemoryGraphAgent', 'memory-graph-agent'],
    ctor: MemoryGraphAgent as AgentConstructor,
  },
  {
    keys: ['TaskAgent', 'task-agent'],
    ctor: TaskAgent as AgentConstructor,
  },
  {
    keys: ['CalendarAgent', 'calendar-agent', 'google-calendar-agent'],
    ctor: CalendarAgent as AgentConstructor,
  },
  {
    keys: ['FinanceAgent', 'finance-agent'],
    ctor: FinanceAgent as AgentConstructor,
  },
  {
    keys: ['EmailMonitoringAgent', 'email-monitoring-agent', 'gmail-communication-agent'],
    ctor: EmailMonitoringAgent as AgentConstructor,
  },
  {
    keys: ['AISummarizerAgent', 'ai-summarizer-agent', 'docs-summarizer-agent'],
    ctor: AISummarizerAgent as AgentConstructor,
  },
  {
    keys: ['AnalyticsAgent', 'analytics-agent', 'data-analyst-agent'],
    ctor: AnalyticsAgent as AgentConstructor,
  },
  {
    keys: ['MetaControllerAgent', 'meta-controller-agent', 'atlas-meta-controller'],
    ctor: MetaControllerAgent as AgentConstructor,
  },
];

for (const { keys, ctor } of BUILTIN_AGENT_DEFINITIONS) {
  for (const key of keys) {
    SUPPORTED_AGENTS[key] = ctor;
  }
}

const dynamicAgentCache = new Map<string, AgentConstructor>();

function resolveSupportedAgent(type: string): AgentConstructor | undefined {
  if (!type) return undefined;
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

function cacheDynamicAgent(type: string, schema: AgentSchema): AgentConstructor {
  const DynamicAgent = buildDynamicAgentFromSchema(schema);
  dynamicAgentCache.set(type.toLowerCase(), DynamicAgent);
  return DynamicAgent;
}

function getCachedDynamicAgent(type: string): AgentConstructor | undefined {
  return dynamicAgentCache.get(type.toLowerCase());
}

function extractCapabilities(config: Record<string, unknown>, fallback: string[] = []): string[] {
  const raw = config.capabilities;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }
  return fallback;
}

function extractSafeActions(config: Record<string, unknown>, fallback: string[] = []): string[] {
  const raw = config.safeActions;
  if (Array.isArray(raw)) {
    return raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toUpperCase());
  }
  return fallback;
}

function extractCommandScope(config: Record<string, unknown>, fallback: string[] = []): string[] {
  const raw = config.commandScope;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }
  return fallback;
}

function extractPrivilegeLevel(config: Record<string, unknown>, fallback: PrivilegeLevel): PrivilegeLevel {
  const raw = config.privilegeLevel;
  if (typeof raw === 'string') {
    const normalized = raw.toLowerCase() as PrivilegeLevel;
    return normalized;
  }
  return fallback;
}

function extractBindings(config: Record<string, unknown>): string[] {
  const raw = config.bindings;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }
  return [];
}

function buildRegistrationPayload(
  agentType: string,
  config: Record<string, unknown>,
  schemaCapabilities?: string[],
) {
  const profile = getAgentProfile(agentType);
  const capabilities = new Set<string>();
  const safeActions = new Set<string>();
  const commandScope = new Set<string>();

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

export async function createAgent(type: string, config: BaseAgentOptions & Record<string, unknown>): Promise<BaseAgent> {
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
