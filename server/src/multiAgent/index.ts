import { AgentRegistry } from './AgentRegistry.js';
import { MessageBroker } from './MessageBroker.js';
import { ConversationGovernor } from '../core/conversation-governor.js';
import { CoreOrchestrator } from '../core/orchestrator.js';
import { setCoreOrchestrator } from '../core/orchestrator-registry.js';

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

export { AgentRegistry } from './AgentRegistry.js';
export { MessageBroker } from './MessageBroker.js';
export { BaseAgent } from './BaseAgent.js';
export { SlackBotAgent } from './agents/SlackBotAgent.js';
export { RAGAgent } from './agents/RAGAgent.js';

export type {
  AgentMessage,
  AgentMessageType,
  AgentStateChange,
  AgentStateLinkActivity,
} from './MessageBroker.js';
export type { BaseAgentOptions, AgentMemoryEntry } from './BaseAgent.js';
