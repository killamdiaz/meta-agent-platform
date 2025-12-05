import type { AgentMessage } from '../../multiAgent/MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../../multiAgent/BaseAgent.js';
import { SlackClient, createSlackClientFromConfig } from './SlackClient.js';
import { MemoryService } from '../../services/MemoryService.js';

interface SlackToolAgentOptions extends BaseAgentOptions {
  config: Record<string, unknown>;
}

export class SlackToolAgent extends BaseAgent {
  private readonly slack: SlackClient;
  private readonly defaultChannel?: string;
  private readonly conversationContext = new Map<string, { channel?: string; threadTs?: string }>();

  constructor({ config, ...baseOptions }: SlackToolAgentOptions) {
    const role = baseOptions.role?.trim() || 'Slack Communications Agent';
    const description =
      baseOptions.description ??
      'Slack integration specialist. Routes summaries and alerts to the workspace and captures mentions for follow-up.';
    super({
      ...baseOptions,
      role,
      description,
    });
    this.slack = createSlackClientFromConfig(config);
    this.defaultChannel = this.slack.getDefaultChannel();
    console.log('[slack-tool-agent] initialized', {
      agentId: this.id,
      defaultChannel: this.defaultChannel ?? '(none)',
    });
    void this.slack.authInfo()
      .then((info) => {
        console.log('[slack-tool-agent] authenticated as', {
          agentId: this.id,
          botUserId: info.botUserId,
          botUserName: info.botUserName,
          team: info.team,
          defaultChannel: this.defaultChannel ?? '(none)',
        });
      })
      .catch((error) => {
        console.error('[slack-tool-agent] failed to resolve auth info', error);
      });
    this.startAutonomy(12000);
    void this.bootstrapMonitoring();
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'task') {
      await this.handleTask(message);
      return;
    }

    if (message.type === 'response') {
      await this.handleTask({ ...message, type: 'task' });
      return;
    }

    if (message.type === 'question') {
      await this.sendMessage(message.from, 'response', 'Routing your request to Slack.');
      await this.handleTask({ ...message, type: 'task' });
      return;
    }

    await this.sendMessage(message.from, 'response', 'Slack agent received your message.');
  }

  protected override async think(): Promise<void> {
    try {
      const mentions = await this.slack.fetchRecentMentions(3);
      if (!mentions.length) {
        console.log('[slack-tool-agent] no new mentions', { agentId: this.id });
        return;
      }
      for (const mention of mentions) {
        console.log('[slack-tool-agent] mention detected', {
          agentId: this.id,
          user: mention.user,
          ts: mention.ts,
          channel: mention.channel,
          text: mention.text,
        });
        const contextId = mention.ts ?? `${this.id}-${Date.now()}`;
        const contextData = {
          channel: mention.channel ?? this.defaultChannel,
          threadTs: mention.ts,
        };
        this.conversationContext.set(contextId, contextData);
        void MemoryService.addMemory(this.id, `${mention.user ?? 'Slack user'} mentioned ${this.name}: ${mention.text}`, {
          channel: mention.channel ?? this.defaultChannel,
          threadTs: mention.ts,
          direction: 'incoming',
          platform: 'slack',
          contextId,
          type: 'mention',
          userId: mention.user,
          memoryType: 'short_term',
          retention: 'short_term',
          category: 'conversation',
          ephemeral: true,
          importance: 'low',
        });
        if (contextData.channel && mention.ts) {
          try {
            const aiReply = await this.composeReplyForMention(mention.text, mention.user);
            await this.slack.replyInThread(mention.ts, aiReply, contextData.channel);
            void MemoryService.addMemory(this.id, `Reply to ${mention.user ?? 'Slack user'}: ${aiReply}`, {
              channel: contextData.channel,
              threadTs: mention.ts,
              direction: 'outgoing',
              platform: 'slack',
              contextId,
              type: 'acknowledgement',
              memoryType: 'short_term',
              retention: 'short_term',
              category: 'conversation',
              ephemeral: true,
              importance: 'low',
            });
          } catch (error) {
            console.error('[slack-tool-agent] failed to craft Slack reply', {
              agentId: this.id,
              channel: contextData.channel,
              ts: mention.ts,
              error,
            });
          }
        }
        const outbound = await this.sendMessage('*', 'question', `New mention in Slack from ${mention.user ?? 'unknown user'}: ${mention.text}`, {
          origin: this.id,
          platform: 'slack',
          threadTs: mention.ts,
          permalink: mention.permalink,
          channel: mention.channel ?? this.defaultChannel,
          contextId,
          autonomy: {
            askAgents: ['RAGAgent'],
            needsContextFrom: ['StrategyAgent'],
          },
        });
        this.conversationContext.set(outbound.id, contextData);
      }
    } catch (error) {
        console.error('[slack-tool-agent] failed to fetch mentions', {
          agentId: this.id,
          error,
        });
    }
  }

  private async bootstrapMonitoring() {
    try {
      console.log('[slack-tool-agent] initial mention sweep starting', { agentId: this.id });
      await this.think();
      console.log('[slack-tool-agent] initial mention sweep complete', { agentId: this.id });
    } catch (error) {
      console.error('[slack-tool-agent] bootstrap monitoring failed', {
        agentId: this.id,
        error,
      });
    }
  }

  private async handleTask(message: AgentMessage) {
    const metadata = message.metadata ?? {};
    const candidateKeys = [
      typeof metadata.contextId === 'string' ? metadata.contextId : undefined,
      typeof metadata.inReplyTo === 'string' ? metadata.inReplyTo : undefined,
      typeof metadata.questionId === 'string' ? metadata.questionId : undefined,
    ].filter((value): value is string => Boolean(value));
    console.log('[slack-tool-agent] resolving context for message', {
      agentId: this.id,
      candidateKeys,
      metadata,
    });
    let context: { channel?: string; threadTs?: string } | undefined;
    for (const key of candidateKeys) {
      context = this.conversationContext.get(key);
      if (context) {
        break;
      }
    }
    const channel =
      (typeof metadata.channel === 'string' ? metadata.channel : undefined) ??
      context?.channel ??
      this.defaultChannel;
    const threadTs =
      (typeof metadata.threadTs === 'string' ? metadata.threadTs : undefined) ?? context?.threadTs;
    if (!channel) {
      console.warn('[slack-tool-agent] unable to determine Slack channel for outgoing message', {
        agentId: this.id,
        metadata,
        context,
      });
      return;
    }
    console.log('[slack-tool-agent] handling outbound message', {
      agentId: this.id,
      channel,
      threadTs,
    });
    try {
      await this.slack.postMessage({
        channel,
        text: message.content,
        threadTs,
      });
      void MemoryService.addMemory(this.id, `Sent to Slack (${channel}${threadTs ? ` ▸ ${threadTs}` : ''}): ${message.content}`, {
        channel,
        threadTs,
        direction: 'outgoing',
        platform: 'slack',
        contextKeys: candidateKeys,
        messageId: message.id,
        metadata,
        memoryType: 'short_term',
        retention: 'short_term',
        category: 'conversation',
        ephemeral: true,
        importance: 'low',
      });
    } catch (error) {
      console.error('[slack-tool-agent] failed to post message to Slack', {
        agentId: this.id,
        channel,
        threadTs,
        error,
      });
      throw error;
    }
    await this.sendMessage(message.from, 'response', `Message relayed to Slack ${channel ?? ''}`.trim(), {
      origin: this.id,
      route: 'slack',
      channel,
    });
    if (message.type === 'response') {
      for (const key of candidateKeys) {
        this.conversationContext.delete(key);
      }
    }
  }

  private async composeReplyForMention(text: string, userId?: string) {
    const reply = await this.generateLLMReply({
      from: userId ?? 'SlackUser',
      content: text,
      systemPrompt: `You are ${this.name}, a helpful Slack assistant. Respond directly to the user's message with actionable insight, offer next steps, and keep the tone friendly and professional. Reference any context in the message and avoid generic apologies unless necessary.`,
    });
    return reply;
  }
}
