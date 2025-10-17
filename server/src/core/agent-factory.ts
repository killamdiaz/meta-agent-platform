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
import type { BaseAgent, BaseAgentOptions } from '../multiAgent/BaseAgent.js';
import type { AgentSchema } from '../types/agents.js';
import { logAgentEvent } from './agent-logger.js';

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

export async function createAgent(type: string, config: BaseAgentOptions & Record<string, unknown>): Promise<BaseAgent> {
  const requestedType = type.trim();
  console.info(`[agent-factory] createAgent requested`, { type: requestedType });

  const BuiltInAgent = resolveSupportedAgent(requestedType);
  if (BuiltInAgent) {
    console.info(`[agent-factory] using built-in agent for "${requestedType}"`);
    const instance = new BuiltInAgent(config);
    await bindClient(instance, requestedType, config);
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
