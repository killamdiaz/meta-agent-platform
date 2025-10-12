import { AgentRegistry } from './AgentRegistry.js';
import { MessageBroker } from './MessageBroker.js';

export const agentBroker = new MessageBroker();
export const agentRegistry = new AgentRegistry(agentBroker);

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
