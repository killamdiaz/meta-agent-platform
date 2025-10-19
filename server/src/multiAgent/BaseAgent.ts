import type { AgentRegistry } from './AgentRegistry.js';
import {
  MessageBroker,
  type AgentMessage,
  type AgentMessageType,
  type AgentStateChange,
  type AgentStateLinkActivity,
} from './MessageBroker.js';
import { MemoryService } from '../services/MemoryService.js';
import { config } from '../config.js';
import { getCoreOrchestrator } from '../core/orchestrator-registry.js';
import type { GovernedMessage } from '../core/orchestrator.js';
import { routeMessage } from '../llm/router.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';

export interface BaseAgentOptions {
  id: string;
  name: string;
  role: string;
  description?: string;
  broker: MessageBroker;
  registry?: AgentRegistry;
  memoryLimit?: number;
  model?: string;
  connections?: string[];
  aliases?: string[];
  onStateChange?: (change: AgentStateChange) => void;
}

export interface AgentMemoryEntry {
  direction: 'incoming' | 'outgoing';
  message: AgentMessage;
  recordedAt: string;
}

class AsyncQueue<T> {
  private readonly queue: T[] = [];
  private readonly waiting: Array<(item: T | undefined) => void> = [];
  private closed = false;

  push(item: T) {
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

  next(): Promise<T | undefined> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift());
    }
    if (this.closed) {
      return Promise.resolve(undefined);
    }
    return new Promise<T | undefined>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    while (this.waiting.length) {
      const resolver = this.waiting.shift();
      resolver?.(undefined);
    }
    this.queue.length = 0;
  }
}

export abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly description?: string;
  client: unknown = null;

  protected readonly broker: MessageBroker;
  protected readonly registry?: AgentRegistry;
  protected readonly memory: AgentMemoryEntry[] = [];
  protected readonly model: string;

  private readonly memoryLimit: number;
  private readonly onStateChange?: (change: AgentStateChange) => void;
  private readonly inbox = new AsyncQueue<AgentMessage>();
  private readonly teardownCallbacks: Array<() => void> = [];
  private readonly connectionSet = new Set<string>();
  private readonly followUpQueue: Array<{
    to: string;
    type: AgentMessageType;
    content: string;
    metadata?: AgentMessage['metadata'];
  }> = [];
  private processingLoopActive = false;
  private disposed = false;
  private autonomyTimer: NodeJS.Timeout | null = null;
  private talking = false;
  private flushingFollowUps = false;

  protected constructor(options: BaseAgentOptions) {
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
  }

  get isTalking(): boolean {
    return this.talking;
  }

  get connections(): string[] {
    return Array.from(this.connectionSet).filter(Boolean);
  }

  receiveMessage(message: AgentMessage) {
    this.noteConnection(message.from);
    this.recordMemory(message, 'incoming');
    this.inbox.push(message);
    this.handleAutonomySignals(message);
    void this.ensureProcessingLoop();
  }

  async sendMessage(
    to: string,
    type: AgentMessageType,
    content: string,
    metadata?: AgentMessage['metadata'],
  ): Promise<AgentMessage> {
    const orchestrator = getCoreOrchestrator();
    const governed: GovernedMessage = {
      from: this.id,
      to,
      type: this.mapAgentMessageType(type),
      intent: typeof metadata?.intent === 'string' ? metadata.intent : type,
      content,
      confidence: typeof metadata?.confidence === 'number' ? metadata.confidence : undefined,
      tokens: typeof metadata?.tokens === 'number' ? metadata.tokens : undefined,
      metadata: metadata as Record<string, unknown> | undefined,
      requiredCapabilities: Array.isArray(metadata?.requiredCapabilities)
        ? (metadata?.requiredCapabilities as string[])
        : undefined,
      requiredBindings: Array.isArray(metadata?.requiredBindings)
        ? (metadata?.requiredBindings as string[])
        : undefined,
      conversationId: typeof metadata?.conversationId === 'string' ? metadata.conversationId : undefined,
    };

    const published = await orchestrator.broadcast(governed);
    if (!published) {
      throw new Error('Message blocked by conversation governor.');
    }

    const message: AgentMessage = {
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

  private mapAgentMessageType(type: AgentMessageType): GovernedMessage['type'] {
    switch (type) {
      case 'response':
        return 'RESULT';
      case 'task':
        return 'TASK';
      default:
        return 'INFO';
    }
  }

  getMemorySnapshot(): AgentMemoryEntry[] {
    return this.memory.map((entry) => ({ ...entry, message: { ...entry.message } }));
  }

  startAutonomy(intervalMs = 5000) {
    if (this.autonomyTimer) return;
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
    if (this.disposed) return;
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

  protected abstract processMessage(message: AgentMessage): Promise<void>;

  protected async think(): Promise<void> {
    await this.flushFollowUps();
  }

  protected connectTo(target: string) {
    if (!target || target === this.id || target === '*' || target === 'broadcast') return;
    if (!this.connectionSet.has(target)) {
      this.connectionSet.add(target);
      this.pushConnectionUpdate();
    }
  }

  protected disconnectFrom(target: string) {
    if (!target || target === this.id) return;
    if (this.connectionSet.delete(target)) {
      this.pushConnectionUpdate();
    }
  }

  protected setConnections(targets: Iterable<string>) {
    this.connectionSet.clear();
    for (const target of targets) {
      if (target && target !== this.id) {
        this.connectionSet.add(target);
      }
    }
    this.pushConnectionUpdate();
  }

  protected registerTopicAlias(topic: string) {
    const normalized = this.normaliseTopicValue(topic);
    if (!normalized) return;
    this.broker.registerTopicAlias(this.id, normalized.original);
    if (normalized.compact && normalized.compact !== normalized.original) {
      this.broker.registerTopicAlias(this.id, normalized.compact);
    }
  }

  protected unregisterTopicAlias(topic: string) {
    const normalized = this.normaliseTopicValue(topic);
    if (!normalized) return;
    this.broker.unregisterTopicAlias(this.id, normalized.original);
    if (normalized.compact && normalized.compact !== normalized.original) {
      this.broker.unregisterTopicAlias(this.id, normalized.compact);
    }
  }

  private normaliseTopicValue(topic: string): { original: string; compact?: string } | null {
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

  protected async queueFollowUp(
    to: string,
    type: AgentMessageType,
    content: string,
    metadata?: AgentMessage['metadata'],
  ) {
    this.followUpQueue.push({ to, type, content, metadata });
    await this.flushFollowUps();
  }

  protected async generateLLMReply(options: {
    from: string;
    content: string;
    metadata?: Record<string, unknown>;
    context?: string;
    systemPrompt?: string;
  }): Promise<string> {
    const systemPrompt =
      options.systemPrompt ??
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

  private initialiseConnections(initial?: string[]) {
    if (Array.isArray(initial)) {
      for (const entry of initial) {
        if (entry && entry !== this.id) {
          this.connectionSet.add(entry);
        }
      }
    }
  }

  private async ensureProcessingLoop() {
    if (this.processingLoopActive) return;
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
        } catch (error) {
          console.error(`[agent:${this.id}] failed to process message ${message.id}`, error);
        } finally {
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
    } finally {
      this.processingLoopActive = false;
    }
  }

  private recordMemory(message: AgentMessage, direction: AgentMemoryEntry['direction']) {
    const entry: AgentMemoryEntry = {
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

  private emitTalkingState(message: AgentMessage, direction: AgentStateChange['direction'], isTalking: boolean) {
    this.talking = isTalking;
    this.dispatchStateChange({
      message,
      direction,
      isTalking,
    });
  }

  private emitLinkActivity(activity: AgentStateLinkActivity) {
    this.dispatchStateChange({
      linkActivity: activity,
    });
  }

  private dispatchStateChange(update: Omit<AgentStateChange, 'agentId'>) {
    const payload: AgentStateChange = {
      agentId: this.id,
      ...update,
    };
    this.onStateChange?.(payload);
    this.broker.emitStateChange(payload);
  }

  private noteConnection(target: string) {
    if (!target || target === this.id || target === '*' || target === 'broadcast') return;
    if (!this.connectionSet.has(target)) {
      this.connectionSet.add(target);
      this.pushConnectionUpdate();
    }
  }

  private pushConnectionUpdate() {
    this.broker.updateAgent(this.id, {
      connections: this.connections,
      isTalking: this.talking,
    });
  }

  private handleAutonomySignals(message: AgentMessage) {
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== 'object') return;
    const autonomy = (metadata as { autonomy?: unknown }).autonomy;
    if (!autonomy || typeof autonomy !== 'object') return;

    const ensureStrings = (value: unknown) =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

    const askAgents = ensureStrings((autonomy as { askAgents?: unknown }).askAgents);
    const escalateTo = ensureStrings((autonomy as { escalateTo?: unknown }).escalateTo);
    const needsContextFrom = ensureStrings((autonomy as { needsContextFrom?: unknown }).needsContextFrom);

    const targets = new Set<string>();
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

  private async flushFollowUps() {
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
    } finally {
      this.flushingFollowUps = false;
    }
  }
}
