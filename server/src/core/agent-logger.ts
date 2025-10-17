import { agentBroker } from '../multiAgent/index.js';

type AgentLogPayload = {
  from?: string;
  to?: string;
  type?: 'question' | 'response' | 'task';
  metadata?: Record<string, unknown>;
};

const SYSTEM_SENDER = 'system';

export function logAgentEvent(
  agentId: string,
  content: string,
  options: AgentLogPayload = {},
): void {
  if (!agentId) {
    return;
  }

  const payload = {
    from: options.from ?? SYSTEM_SENDER,
    to: options.to ?? agentId,
    type: options.type ?? 'task',
    content,
    metadata: {
      __log: true,
      source: options.from ?? SYSTEM_SENDER,
      ...(options.metadata ?? {}),
    },
  } as const;

  try {
    agentBroker.publish(payload);
  } catch (error) {
    console.warn('[agent-logger] failed to publish log event', {
      agentId,
      content,
      error,
    });
  }
}

