import type { AgentMessage } from '../MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../BaseAgent.js';

interface SlackBotAgentOptions extends Omit<BaseAgentOptions, 'description' | 'role'> {
  role?: string;
  ragAgentId: string;
  knowledgeBase?: Record<string, string>;
  fallbackChannelId?: string;
  escalateKeywords?: string[];
}

interface DelegationMetadata {
  questionId: string;
  originalSender: string;
  escalationReason: string;
}

export class SlackBotAgent extends BaseAgent {
  private readonly ragAgentId: string;
  private readonly knowledgeBase: Map<string, string>;
  private readonly fallbackChannelId: string;
  private readonly escalateKeywords: string[];
  private readonly pendingDelegations = new Map<string, { content: string; lastRequestedAt: number }>();

  constructor(options: SlackBotAgentOptions) {
    super({
      ...options,
      role:
        options.role ??
        'Slack Orchestrator',
      aliases: Array.from(
        new Set([
          ...(options.aliases ?? []),
          'SlackBotAgent',
          'SlackAgent',
          'SlackBot',
        ]),
      ),
      description:
        'Slack front-door agent. Routes user queries, answers simple questions, and collaborates with specialists when extra context is required.',
    });
    this.ragAgentId = options.ragAgentId;
    this.knowledgeBase = new Map(Object.entries(options.knowledgeBase ?? {}));
    this.fallbackChannelId = options.fallbackChannelId ?? 'channel:general';
    this.escalateKeywords = (options.escalateKeywords ?? ['why', 'how', 'policy', 'compliance']).map((word) =>
      word.toLowerCase(),
    );
    this.connectTo(this.ragAgentId);
    this.startAutonomy(7000);
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    // Response from the RAG agent comes back here.
    if (message.from === this.ragAgentId && message.type === 'response') {
      await this.forwardExpertResponse(message);
      return;
    }

    if (message.type !== 'question' && message.type !== 'task') {
      // Slack bot defaults to acknowledgement for other message types.
      await this.sendMessage(message.from, 'response', 'Noted! I will keep that in mind.', {
        origin: this.id,
        inReplyTo: message.id,
      });
      return;
    }

    const cleanedContent = message.content.trim();
    const kbHit = this.lookupKnowledgeBase(cleanedContent);
    if (kbHit) {
      await this.sendMessage(message.from, 'response', kbHit, {
        origin: this.id,
        source: 'knowledge-base',
        questionId: message.id,
      });
      return;
    }

    const escalationReason = this.needsExpertSupport(cleanedContent, message.metadata);
    if (escalationReason) {
      await this.delegateToRagAgent(cleanedContent, message, escalationReason);
      return;
    }

    const response = await this.generateLLMReply({
      from: message.from,
      content: cleanedContent,
      metadata: message.metadata,
      context: this.composeConversationContext(message),
      systemPrompt: `You are Agent ${this.id} (${this.name}), acting as a Slack assistant. Provide concise, helpful answers and include actionable next steps when appropriate.`,
    });

    await this.sendMessage(message.from, 'response', response, {
      origin: this.id,
      questionId: message.id,
      route: 'direct',
    });
  }

  private lookupKnowledgeBase(query: string): string | undefined {
    if (!query) return undefined;
    const lower = query.toLowerCase();
    for (const [key, value] of this.knowledgeBase.entries()) {
      if (lower.includes(key.toLowerCase())) {
        return value;
      }
    }
    return undefined;
  }

  private needsExpertSupport(
    content: string,
    metadata?: Record<string, unknown>,
  ): string | undefined {
    if (!content) {
      return 'Empty question provided.';
    }
    if (metadata && typeof metadata === 'object') {
      const meta = metadata as Record<string, unknown>;
      if (meta.requiresResearch === true) {
        return 'Explicit request for research support.';
      }
      if (typeof meta.confidence === 'number' && meta.confidence < 0.45) {
        return `Low confidence (${meta.confidence}).`;
      }
      if (typeof meta.routeToExpert === 'string') {
        return `Route-to-expert flag: ${meta.routeToExpert}`;
      }
    }
    if (content.length > 240) {
      return 'Long-form question better handled by specialist.';
    }
    if (this.escalateKeywords.some((keyword) => content.toLowerCase().includes(keyword))) {
      return 'Contains escalation keyword.';
    }
    const questionMarks = content.split('?').length - 1;
    if (questionMarks >= 2) {
      return 'Multiple layered questions detected.';
    }
    return undefined;
  }

  private composeConversationContext(message: AgentMessage) {
    const conversationId = this.extractConversationId(message.metadata);
    const history = this.getMemorySnapshot()
      .filter((entry) => this.extractConversationId(entry.message.metadata) === conversationId)
      .slice(-5)
      .map(
        (entry) =>
          `${entry.direction === 'incoming' ? 'From' : 'To'} ${entry.message.from === this.id ? entry.message.to : entry.message.from}: ${entry.message.content}`,
      )
      .join('\n');
    return history || undefined;
  }

  private async delegateToRagAgent(content: string, message: AgentMessage, reason: string) {
    const metadata: DelegationMetadata = {
      questionId: message.id,
      originalSender: message.from,
      escalationReason: reason,
    };
    const mergedMetadata = { ...(message.metadata ?? {}), ...metadata };
    await this.sendMessage(this.ragAgentId, 'question', content, mergedMetadata);
    this.pendingDelegations.set(message.id, {
      content,
      lastRequestedAt: Date.now(),
    });
    await this.sendMessage(
      message.from,
      'response',
      'Let me loop in our knowledge specialist for a detailed answer. I will get back to you shortly.',
      {
        origin: this.id,
        status: 'delegated',
        delegate: this.ragAgentId,
        questionId: message.id,
        escalationReason: reason,
      },
    );
  }

  private async forwardExpertResponse(message: AgentMessage) {
    const meta = this.parseDelegationMetadata(message.metadata);
    const forwardTarget = meta?.originalSender ?? this.fallbackChannelId;
    const references = this.extractReferences(message.metadata);
    if (meta?.questionId) {
      this.pendingDelegations.delete(meta.questionId);
    }
    await this.sendMessage(forwardTarget, 'response', message.content, {
      origin: this.id,
      fromExpert: this.ragAgentId,
      questionId: meta?.questionId ?? message.id,
      escalationReason: meta?.escalationReason,
      references,
    });
  }

  protected override async think(): Promise<void> {
    await super.think();
    const now = Date.now();
    for (const [questionId, state] of this.pendingDelegations.entries()) {
      if (now - state.lastRequestedAt < 6500) {
        continue;
      }
      state.lastRequestedAt = now;
      await this.queueFollowUp(
        this.ragAgentId,
        'question',
        `Gentle reminder: need supporting data for question ${questionId} -> "${state.content.slice(0, 140)}"`,
        {
          origin: this.id,
          questionId,
          rationale: 'autonomy:follow-up',
        },
      );
    }
  }

  private extractConversationId(metadata?: Record<string, unknown>): string | undefined {
    if (!metadata) return undefined;
    const value = metadata.conversationId;
    return typeof value === 'string' ? value : undefined;
  }

  private parseDelegationMetadata(
    metadata?: Record<string, unknown>,
  ): DelegationMetadata | undefined {
    if (!metadata) return undefined;
    const questionId = metadata.questionId;
    const originalSender = metadata.originalSender;
    const escalationReason = metadata.escalationReason;
    if (
      typeof questionId === 'string' &&
      typeof originalSender === 'string' &&
      typeof escalationReason === 'string'
    ) {
      return { questionId, originalSender, escalationReason };
    }
    return undefined;
  }

  private extractReferences(metadata?: Record<string, unknown>) {
    if (!metadata) return undefined;
    const references = metadata.references;
    return Array.isArray(references) ? references : undefined;
  }
}
