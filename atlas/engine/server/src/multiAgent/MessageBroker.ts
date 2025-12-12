import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export type AgentMessageType = 'question' | 'response' | 'task';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: AgentMessageType;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentStateLinkActivity {
  targetId: string;
  direction: 'incoming' | 'outgoing';
  isActive: boolean;
  messageId?: string;
  timestamp: string;
}

export interface AgentStateChange {
  agentId: string;
  isTalking?: boolean;
  message?: AgentMessage;
  direction?: 'incoming' | 'outgoing';
  linkActivity?: AgentStateLinkActivity;
}

export type MessagePayload = Omit<AgentMessage, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};

type BrokerEventName = 'message' | 'agent:state' | 'agent:graph' | 'token';

export interface BrokerAgentDescriptor {
  id: string;
  name: string;
  role: string;
  connections: string[];
  isTalking: boolean;
}

export interface BrokerLinkDescriptor {
  id: string;
  source: string;
  target: string;
  isActive: boolean;
  lastMessageId?: string;
  activeUntil?: number;
}

export interface BrokerGraphSnapshot {
  agents: BrokerAgentDescriptor[];
  links: BrokerLinkDescriptor[];
}

export interface TokenUsageSnapshot {
  total: number;
  byAgent: Record<string, number>;
}

const AGENT_COMMS_DISABLED = process.env.AGENT_COMMS_DISABLED === 'true';

export class MessageBroker extends EventEmitter {
  private readonly history: AgentMessage[] = [];
  private readonly topicSubscribers = new Map<string, Set<string>>();
  private readonly agents = new Map<string, BrokerAgentDescriptor>();
  private readonly links = new Map<string, BrokerLinkDescriptor>();
  private readonly agentTopics = new Map<string, Set<string>>();
  private readonly agentAliasTopics = new Map<string, Set<string>>();
  private readonly tokenUsageByAgent = new Map<string, number>();
  private totalTokens = 0;

  constructor() {
    super();
  }

  publish(payload: MessagePayload): AgentMessage {
    const id = payload.id ?? randomUUID();
    const timestamp = payload.timestamp ?? new Date().toISOString();
    const content = payload.content.trim();
    if (!content) {
      throw new Error('Cannot publish empty message content.');
    }
    const message: AgentMessage = {
      ...payload,
      id,
      timestamp,
      content,
    };
    if (AGENT_COMMS_DISABLED) {
      // FIX APPLIED: Agent-to-agent comms disabled
      return message;
    }
    this.history.push(message);
    this.trackTokenUsage(message);
    this.emit('message', message);
    return message;
  }

  emitStateChange(update: AgentStateChange) {
    if (AGENT_COMMS_DISABLED) {
      return; // FIX APPLIED: Agent-to-agent comms disabled
    }
    this.applyStateChange(update);
    this.emit('agent:state', update);
  }

  registerAgent(agent: { id: string; name: string; role: string; connections?: string[] }) {
    const connections = Array.from(new Set(agent.connections ?? [])).filter((value) => value !== agent.id);
    const descriptor: BrokerAgentDescriptor = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      connections,
      isTalking: false,
    };
    this.agents.set(agent.id, descriptor);
    this.agentAliasTopics.set(agent.id, new Set());
    this.syncTopicSubscriptions(agent.id);
    this.emitGraphSnapshot();
  }

  updateAgent(agentId: string, patch: Partial<Omit<BrokerAgentDescriptor, 'id'>>) {
    const current = this.agents.get(agentId);
    if (!current) return;
    const nextConnections =
      patch.connections !== undefined
        ? Array.from(new Set(patch.connections)).filter((value) => value !== agentId)
        : current.connections;

    const updated: BrokerAgentDescriptor = {
      ...current,
      ...patch,
      connections: nextConnections,
      isTalking: patch.isTalking ?? current.isTalking ?? false,
    };
    this.agents.set(agentId, updated);
    this.syncTopicSubscriptions(agentId);
    this.emitGraphSnapshot();
  }

  unregisterAgent(agentId: string) {
    this.agents.delete(agentId);
    const topics = this.agentTopics.get(agentId);
    if (topics) {
      for (const topic of topics) {
        const subscribers = this.topicSubscribers.get(topic);
        subscribers?.delete(agentId);
        if (subscribers && subscribers.size === 0) {
          this.topicSubscribers.delete(topic);
        }
      }
    }
    this.agentTopics.delete(agentId);
    this.agentAliasTopics.delete(agentId);
    for (const [linkId, link] of this.links.entries()) {
      if (link.source === agentId || link.target === agentId) {
        this.links.delete(linkId);
      }
    }
    this.emitGraphSnapshot();
  }

  resolveSubscribers(topic: string): string[] {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers) {
      return [];
    }
    return Array.from(subscribers);
  }

  getGraphSnapshot(): BrokerGraphSnapshot {
    if (AGENT_COMMS_DISABLED) {
      return {
        agents: Array.from(this.agents.values()).map((agent) => ({
          ...agent,
          connections: [],
          isTalking: false,
        })),
        links: [],
      };
    }
    const now = Date.now();
    const links: BrokerLinkDescriptor[] = [];
    for (const link of this.links.values()) {
      if (link.activeUntil && link.activeUntil < now) {
        // The glow window expired; mark link as inactive but keep last message for history until next update.
        this.links.set(link.id, { ...link, isActive: false, activeUntil: undefined });
        links.push({ ...link, isActive: false, activeUntil: undefined });
      } else {
        links.push({ ...link });
      }
    }
    return {
      agents: Array.from(this.agents.values()).map((agent) => ({
        ...agent,
        connections: [...new Set(agent.connections)],
      })),
      links: links.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target)),
    };
  }

  onGraph(listener: (snapshot: BrokerGraphSnapshot) => void): () => void {
    this.on('agent:graph', listener);
    return () => this.off('agent:graph', listener);
  }

  onMessage(listener: (message: AgentMessage) => void): () => void {
    this.on('message', listener);
    return () => {
      this.off('message', listener);
    };
  }

  onStateChange(listener: (update: AgentStateChange) => void): () => void {
    this.on('agent:state', listener);
    return () => {
      this.off('agent:state', listener);
    };
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  getTokenUsage(): TokenUsageSnapshot {
    return {
      total: this.totalTokens,
      byAgent: Object.fromEntries(this.tokenUsageByAgent.entries()),
    };
  }

  onTokenUsage(listener: (usage: TokenUsageSnapshot) => void): () => void {
    this.on('token', listener);
    return () => {
      this.off('token', listener);
    };
  }

  override emit(eventName: BrokerEventName, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args);
  }

  private applyStateChange(update: AgentStateChange) {
    const descriptor = this.agents.get(update.agentId);
    if (!descriptor) {
      return;
    }
    let hasMutation = false;
    if (typeof update.isTalking === 'boolean' && descriptor.isTalking !== update.isTalking) {
      descriptor.isTalking = update.isTalking;
      hasMutation = true;
    }

    if (update.linkActivity) {
      const activity = update.linkActivity;
      const linkId = `${update.agentId}::${activity.targetId}`;
      if (activity.isActive) {
        const activeUntil = Date.now() + 2500;
        this.links.set(linkId, {
          id: linkId,
          source: update.agentId,
          target: activity.targetId,
          isActive: true,
          lastMessageId: activity.messageId,
          activeUntil,
        });
      } else {
        const existing = this.links.get(linkId);
        if (existing) {
          this.links.set(linkId, {
            ...existing,
            isActive: false,
            activeUntil: undefined,
          });
        }
      }
      hasMutation = true;
    }

    if (hasMutation) {
      this.emitGraphSnapshot();
    }
  }

  private syncTopicSubscriptions(agentId: string) {
    const descriptor = this.agents.get(agentId);
    const previous = this.agentTopics.get(agentId) ?? new Set<string>();
    if (!descriptor) {
      for (const topic of previous) {
        const subscribers = this.topicSubscribers.get(topic);
        subscribers?.delete(agentId);
        if (subscribers && subscribers.size === 0) {
          this.topicSubscribers.delete(topic);
        }
      }
      this.agentTopics.delete(agentId);
      return;
    }

    const aliases = this.agentAliasTopics.get(agentId) ?? new Set<string>();
    const next = new Set<string>([agentId, ...descriptor.connections]);
    for (const alias of aliases) {
      if (alias) {
        next.add(alias);
      }
    }

    for (const topic of previous) {
      if (!next.has(topic)) {
        const subscribers = this.topicSubscribers.get(topic);
        subscribers?.delete(agentId);
        if (subscribers && subscribers.size === 0) {
          this.topicSubscribers.delete(topic);
        }
      }
    }

    for (const topic of next) {
      let subscribers = this.topicSubscribers.get(topic);
      if (!subscribers) {
        subscribers = new Set<string>();
        this.topicSubscribers.set(topic, subscribers);
      }
      subscribers.add(agentId);
    }

    this.agentTopics.set(agentId, next);
  }

  registerTopicAlias(agentId: string, topic: string) {
    if (!topic) return;
    const descriptor = this.agents.get(agentId);
    if (!descriptor) {
      return;
    }
    let aliases = this.agentAliasTopics.get(agentId);
    if (!aliases) {
      aliases = new Set<string>();
      this.agentAliasTopics.set(agentId, aliases);
    }
    if (!aliases.has(topic)) {
      aliases.add(topic);
      this.syncTopicSubscriptions(agentId);
    }
  }

  unregisterTopicAlias(agentId: string, topic: string) {
    if (!topic) return;
    const aliases = this.agentAliasTopics.get(agentId);
    if (!aliases) return;
    if (aliases.delete(topic)) {
      this.syncTopicSubscriptions(agentId);
    }
  }

  private emitGraphSnapshot() {
    this.emit('agent:graph', this.getGraphSnapshot());
  }

  private trackTokenUsage(message: AgentMessage) {
    const rawValue = (message.metadata as { tokens?: unknown } | undefined)?.tokens;
    const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      return;
    }
    this.totalTokens += parsed;
    const previous = this.tokenUsageByAgent.get(message.from) ?? 0;
    this.tokenUsageByAgent.set(message.from, previous + parsed);
    const snapshot = this.getTokenUsage();
    this.emit('token', snapshot);
  }
}
