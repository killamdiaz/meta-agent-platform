import { AgentRegistry } from './AgentRegistry.js';
import { MessageBroker } from './MessageBroker.js';
import { ConversationGovernor } from '../core/conversation-governor.js';
import { CoreOrchestrator } from '../core/orchestrator.js';
import { setCoreOrchestrator } from '../core/orchestrator-registry.js';
import { MetaCortexBus } from './MetaCortexBus.js';
import { configureAtlasBridgePolling } from '../services/AtlasBridgePoller.js';

export const agentBroker = new MessageBroker();
export const agentRegistry = new AgentRegistry(agentBroker);

const DEFAULT_GOVERNOR_POLICY = {
  cooldownMs: 750,
  maxTokensPerCycle: 4000,
  similarityThreshold: 0.85,
  confidenceThreshold: 0.4,
  maxTurns: 20,
  loopDetectionWindow: 4,
  cycleDurationMs: 4 * 60 * 1000,
  plan: 'pro' as const,
};

export const conversationGovernor = new ConversationGovernor(DEFAULT_GOVERNOR_POLICY);
export const coreOrchestrator = new CoreOrchestrator(agentBroker, conversationGovernor);
setCoreOrchestrator(coreOrchestrator);

const metaAgentIdEnv =
  process.env.META_AGENT_ID ?? process.env.NEXT_PUBLIC_META_AGENT_ID ?? process.env.VITE_META_AGENT_ID;
const metaAgentSecretEnv = process.env.META_AGENT_SECRET;
const metaAgentTokenEnv =
  process.env.META_AGENT_JWT ?? process.env.META_AGENT_TOKEN ?? process.env.ATLAS_BRIDGE_TOKEN ?? '';
const notificationConfig =
  metaAgentIdEnv && metaAgentSecretEnv && metaAgentTokenEnv.trim().length > 0
    ? {
        agentId: metaAgentIdEnv,
        secret: metaAgentSecretEnv,
        token: metaAgentTokenEnv.trim(),
        baseUrl: process.env.ATLAS_BRIDGE_BASE_URL,
        defaultCacheTtlMs: 0,
      }
    : null;

if (!notificationConfig) {
  if (metaAgentIdEnv && metaAgentSecretEnv) {
    console.warn(
      '[meta-cortex-bus] Atlas Bridge notifications disabled; set META_AGENT_JWT (or META_AGENT_TOKEN/ATLAS_BRIDGE_TOKEN) to enable.',
    );
  } else {
    console.warn(
      '[meta-cortex-bus] Missing META_AGENT_ID/META_AGENT_SECRET; Atlas Bridge notifications are disabled.',
    );
  }
}

configureAtlasBridgePolling(
  notificationConfig
    ? {
        agentId: notificationConfig.agentId,
        secret: notificationConfig.secret,
        token: notificationConfig.token,
        baseUrl: notificationConfig.baseUrl,
        defaultCacheTtlMs: notificationConfig.defaultCacheTtlMs ?? 0,
      }
    : undefined,
);

export const metaCortexBus = new MetaCortexBus(agentBroker, {
  memoryAgentId: process.env.MEMORY_GRAPH_AGENT_ID ?? 'memory-graph-agent',
  ...(notificationConfig ? { notification: notificationConfig } : {}),
});

export { AgentRegistry } from './AgentRegistry.js';
export { MessageBroker } from './MessageBroker.js';
export { BaseAgent } from './BaseAgent.js';
export { SlackBotAgent } from './agents/SlackBotAgent.js';
export { RAGAgent } from './agents/RAGAgent.js';
export { MemoryGraphAgent } from './agents/MemoryGraphAgent.js';
export { TaskAgent } from './agents/TaskAgent.js';
export { CalendarAgent } from './agents/CalendarAgent.js';
export { FinanceAgent } from './agents/FinanceAgent.js';
export { EmailMonitoringAgent } from './agents/EmailMonitoringAgent.js';
export { AISummarizerAgent } from './agents/AISummarizerAgent.js';
export { AnalyticsAgent } from './agents/AnalyticsAgent.js';
export { MetaControllerAgent } from './agents/MetaControllerAgent.js';

export type {
  AgentMessage,
  AgentMessageType,
  AgentStateChange,
  AgentStateLinkActivity,
} from './MessageBroker.js';
export type { BaseAgentOptions, AgentMemoryEntry } from './BaseAgent.js';
