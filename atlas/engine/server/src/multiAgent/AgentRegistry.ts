import type { BaseAgent } from './BaseAgent.js';
import { MessageBroker, type AgentMessage } from './MessageBroker.js';

export class AgentRegistry {
  private readonly agents = new Map<string, BaseAgent>();

  constructor(private readonly broker: MessageBroker) {
    this.broker.onMessage(this.routeMessage);
  }

  register(agent: BaseAgent) {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with id "${agent.id}" is already registered.`);
    }
    this.agents.set(agent.id, agent);
    this.broker.registerAgent({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      connections: agent.connections,
    });
  }

  unregister(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.dispose?.();
    this.agents.delete(agentId);
    this.broker.unregisterAgent(agentId);
  }

  get(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  list() {
    return Array.from(this.agents.values());
  }

  sendMessage(
    from: string,
    to: string,
    type: AgentMessage['type'],
    content: string,
    metadata?: AgentMessage['metadata'],
  ) {
    return this.broker.publish({ from, to, type, content, metadata });
  }

  private readonly routeMessage = (message: AgentMessage) => {
    if (message.to === '*' || message.to === 'broadcast') {
      this.broadcast(message);
      return;
    }
    const recipients = new Map<string, BaseAgent>();

    const directRecipient = this.agents.get(message.to);
    if (directRecipient) {
      recipients.set(directRecipient.id, directRecipient);
    }

    for (const subscriberId of this.broker.resolveSubscribers(message.to)) {
      if (subscriberId === message.from) {
        continue;
      }
      const subscriber = this.agents.get(subscriberId);
      if (subscriber) {
        recipients.set(subscriber.id, subscriber);
      }
    }

    if (recipients.size === 0) {
      this.broker.emitStateChange({
        agentId: message.to,
        message,
        direction: 'incoming',
      });
      return;
    }

    for (const agent of recipients.values()) {
      agent.receiveMessage({ ...message, to: agent.id });
    }
  };

  private broadcast(message: AgentMessage) {
    for (const [id, agent] of this.agents.entries()) {
      if (id === message.from) continue;
      agent.receiveMessage({ ...message, to: id });
    }
  }
}
