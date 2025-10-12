import { WebClient } from '@slack/web-api';

export interface SlackClientConfig {
  token: string;
  defaultChannel?: string;
  signingSecret?: string;
}

export interface SlackMessage {
  channel?: string;
  text: string;
  threadTs?: string;
}

export class SlackClient {
  private readonly client: WebClient;
  private readonly defaultChannel?: string;
  private readonly channelCache = new Map<string, string>();
  private defaultChannelId?: string;
  private resolvingDefaultChannel?: Promise<string>;
  private botUserId?: string;
  private resolvingBotUserId?: Promise<string>;
  private lastMentionTimestamp?: number;
  private lastMentionPerChannel = new Map<string, number>();
  private readonly startupTimestamp: number;
  private monitoredChannels?: string[];
  private resolvingMonitoredChannels?: Promise<string[]>;
  private readonly threadCheckpoints = new Map<string, { channelId: string; lastTs: number }>();

  constructor(config: SlackClientConfig) {
    if (!config.token) {
      throw new Error('Slack token is required');
    }
    this.client = new WebClient(config.token);
    this.defaultChannel = config.defaultChannel;
    this.startupTimestamp = Math.floor(Date.now() / 1000);
  }

  async postMessage(message: SlackMessage) {
    const channelId = await this.resolveChannelId(message.channel);
    if (!channelId) {
      throw new Error('Slack channel is required to post a message');
    }
    await this.client.chat.postMessage({
      channel: channelId,
      text: message.text,
      thread_ts: message.threadTs,
    });
  }

  async fetchRecentMentions(limit = 5) {
    const channelIds = await this.resolveMonitoredChannels();
    if (!channelIds.length) {
      console.warn('[slack-tool-agent] no channels configured or discovered for monitoring');
      return [];
    }

    const botUserId = await this.ensureBotUserId();
    const mentions: Array<{
      channel: string;
      text: string;
      user?: string;
      ts: string;
      permalink?: string;
    }> = [];
    const processed = new Set<string>();

    const chunkSize = 4;
    for (let index = 0; index < channelIds.length; index += chunkSize) {
      const chunk = channelIds.slice(index, index + chunkSize);
      const results = await Promise.allSettled(
        chunk.map(async (channelId) => {
          const oldestCheckpoint = this.lastMentionPerChannel.get(channelId) ?? this.lastMentionTimestamp ?? this.startupTimestamp;
          const oldest = oldestCheckpoint ? String(oldestCheckpoint) : undefined;
          let history;
          try {
            history = await this.client.conversations.history({
              channel: channelId,
              limit: Math.max(20, limit * 4),
              oldest,
              inclusive: true,
            });
          } catch (error) {
            if (
              error &&
              typeof error === 'object' &&
              'data' in error &&
              (error as { data?: { error?: string } }).data?.error === 'missing_scope'
            ) {
              const needed = (error as { data?: { needed?: string } }).data?.needed;
              console.warn('[slack-tool-agent] missing scope while fetching history', {
                channelId,
                needed,
              });
              return { skipped: true };
            }
            throw error;
          }

          const messages = history?.messages ?? [];
          if (!messages.length) {
            return { skipped: false };
          }

          for (const message of messages) {
            await this.processSlackMessage({
              message,
              channelId,
              botUserId,
              oldestCheckpoint,
              mentions,
              processed,
            });

            const parentTs = typeof (message as { ts?: unknown }).ts === 'string' ? (message as { ts: string }).ts : undefined;
            const replyCount = typeof (message as { reply_count?: unknown }).reply_count === 'number'
              ? (message as { reply_count: number }).reply_count
              : 0;
            if (replyCount > 0 && parentTs) {
              try {
                const replies = await this.client.conversations.replies({
                  channel: channelId,
                  ts: parentTs,
                  limit: Math.max(20, limit * 4),
                });
                for (const reply of replies.messages ?? []) {
                  await this.processSlackMessage({
                    message: reply,
                    channelId,
                    botUserId,
                    oldestCheckpoint,
                    mentions,
                    processed,
                  });
                }
              } catch (error) {
                if (
                  error &&
                  typeof error === 'object' &&
                  'data' in error &&
                  (error as { data?: { error?: string } }).data?.error === 'missing_scope'
                ) {
                  console.warn('[slack-tool-agent] missing scope while fetching thread history', {
                    channelId,
                    thread: parentTs,
                    needed: (error as { data?: { needed?: string } }).data?.needed,
                  });
                  return { skipped: true };
                }
                throw error;
              }
            }
          }

          return { skipped: false };
        })
      );

      for (const outcome of results) {
        if (outcome.status === 'rejected') {
          throw outcome.reason;
        }
      }
    }

    const threadEntries = Array.from(this.threadCheckpoints.entries());
    for (const [rootTs, info] of threadEntries) {
      let cursor: string | undefined;
      let updatedLastTs = info.lastTs;
      try {
        do {
          const response = await this.client.conversations.replies({
            channel: info.channelId,
            ts: rootTs,
            cursor,
            limit: Math.max(20, limit * 4),
          });
          const replies = response.messages ?? [];
          for (const reply of replies) {
            await this.processSlackMessage({
              message: reply,
              channelId: info.channelId,
              botUserId,
              oldestCheckpoint: info.lastTs ?? this.startupTimestamp,
              mentions,
              processed,
            });
            const replyTs = typeof (reply as { ts?: unknown }).ts === 'string' ? (reply as { ts: string }).ts : undefined;
            const replyTsNumeric = replyTs ? Number.parseFloat(replyTs) : NaN;
            if (Number.isFinite(replyTsNumeric) && replyTsNumeric > (updatedLastTs ?? 0)) {
              updatedLastTs = replyTsNumeric;
            }
          }
          cursor = typeof response.response_metadata?.next_cursor === 'string' && response.response_metadata.next_cursor.length > 0
            ? response.response_metadata.next_cursor
            : undefined;
        } while (cursor);
        if (updatedLastTs && updatedLastTs > (info.lastTs ?? 0)) {
          this.threadCheckpoints.set(rootTs, { channelId: info.channelId, lastTs: updatedLastTs });
        }
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'data' in error &&
          (error as { data?: { error?: string } }).data?.error === 'missing_scope'
        ) {
          const needed = (error as { data?: { needed?: string } }).data?.needed;
          console.warn('[slack-tool-agent] missing scope while fetching tracked thread history', {
            channelId: info.channelId,
            thread: rootTs,
            needed,
          });
          continue;
        }
        throw error;
      }
    }

    if (!mentions.length) {
      return [];
    }

    mentions.sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));
    const newest = mentions[mentions.length - 1];
    const newestTs = Number.parseFloat(newest.ts);
    if (Number.isFinite(newestTs)) {
      this.lastMentionTimestamp = newestTs;
      this.lastMentionPerChannel.set(newest.channel, newestTs);
    }

    return mentions.slice(-limit);
  }

  async replyInThread(threadTs: string, text: string, channel?: string) {
    const channelId = await this.resolveChannelId(channel);
    if (!channelId) {
      throw new Error('Slack channel is required to reply in thread');
    }
    await this.client.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
    });
  }

  getDefaultChannel() {
    return this.defaultChannel;
  }

  async authInfo() {
    const auth = await this.client.auth.test();
    return {
      botUserId: auth.user_id ?? null,
      botUserName: auth.user ?? null,
      team: auth.team ?? null,
      teamId: auth.team_id ?? null,
    };
  }

  private static looksLikeChannelId(input: string) {
    return /^[CGD][A-Z0-9]{8,}$/i.test(input);
  }

  private async resolveChannelId(channel?: string): Promise<string | undefined> {
    const target = channel ?? this.defaultChannel;
    if (!target) {
      return undefined;
    }
    const trimmed = target.trim();
    if (SlackClient.looksLikeChannelId(trimmed)) {
      return trimmed;
    }
    const normalised = trimmed.replace(/^#/, '').toLowerCase();
    const cached = this.channelCache.get(normalised);
    if (cached) {
      return cached;
    }
    const response = await this.client.conversations.list({
      limit: 1000,
      types: 'public_channel,private_channel',
    });
    const match = response.channels?.find((entry) => entry?.name?.toLowerCase() === normalised);
    if (!match?.id) {
      throw new Error(`Unable to resolve Slack channel "${target}".`);
    }
    this.channelCache.set(normalised, match.id);
    return match.id;
  }

  private async ensureDefaultChannelId(): Promise<string> {
    if (this.defaultChannelId) {
      return this.defaultChannelId;
    }
    if (this.resolvingDefaultChannel) {
      return this.resolvingDefaultChannel;
    }
    this.resolvingDefaultChannel = (async () => {
      const channelId = await this.resolveChannelId();
      if (!channelId) {
        throw new Error('Slack channel is required but was not provided.');
      }
      this.defaultChannelId = channelId;
      this.resolvingDefaultChannel = undefined;
      return channelId;
    })();
    return this.resolvingDefaultChannel;
  }

  private async ensureBotUserId(): Promise<string> {
    if (this.botUserId) {
      return this.botUserId;
    }
    if (this.resolvingBotUserId) {
      return this.resolvingBotUserId;
    }
    this.resolvingBotUserId = (async () => {
      const auth = await this.client.auth.test();
      if (!auth.user_id) {
        throw new Error('Failed to resolve Slack bot user id. Ensure the token has the correct scope.');
      }
      this.botUserId = auth.user_id;
      this.resolvingBotUserId = undefined;
      return auth.user_id;
    })();
    return this.resolvingBotUserId;
  }

  private async resolveMonitoredChannels(): Promise<string[]> {
    if (this.monitoredChannels) {
      return this.monitoredChannels;
    }
    if (this.resolvingMonitoredChannels) {
      return this.resolvingMonitoredChannels;
    }

    this.resolvingMonitoredChannels = (async () => {
      if (this.defaultChannel) {
        const id = await this.ensureDefaultChannelId();
        this.monitoredChannels = [id];
        return this.monitoredChannels;
      }

      const channels: string[] = [];
      let cursor: string | undefined;

      do {
        const response = await this.client.conversations.list({
          limit: 200,
          cursor,
          types: 'public_channel,private_channel',
        });
        const entries =
          response.channels?.filter((channel) => channel?.is_member && channel.id).map((channel) => channel!.id!) ?? [];
        channels.push(...entries);
        cursor = typeof response.response_metadata?.next_cursor === 'string' && response.response_metadata.next_cursor.length > 0
          ? response.response_metadata.next_cursor
          : undefined;
      } while (cursor && channels.length < 20);

      this.monitoredChannels = channels.slice(0, 20);
      this.resolvingMonitoredChannels = undefined;
      return this.monitoredChannels;
    })();

    return this.resolvingMonitoredChannels;
  }

  private async processSlackMessage(options: {
    message: unknown;
    channelId: string;
    botUserId: string;
    oldestCheckpoint: number;
    mentions: Array<{ channel: string; text: string; user?: string; ts: string; permalink?: string }>;
    processed: Set<string>;
  }) {
    const { message, channelId, botUserId, oldestCheckpoint, mentions, processed } = options;
    if (!message || typeof message !== 'object') return;

    const ts = typeof (message as { ts?: unknown }).ts === 'string' ? (message as { ts: string }).ts : undefined;
    if (!ts) return;
    const cacheKey = `${channelId}:${ts}`;
    if (processed.has(cacheKey)) {
      return;
    }

    const text = typeof (message as { text?: unknown }).text === 'string' ? (message as { text: string }).text : '';
    if (!text || !text.includes(`<@${botUserId}>`)) {
      return;
    }

    const numericTs = Number.parseFloat(ts);
    if (Number.isFinite(numericTs) && numericTs <= oldestCheckpoint) {
      return;
    }

    let permalink: string | undefined;
    try {
      const permalinkResponse = await this.client.chat.getPermalink({ channel: channelId, message_ts: ts });
      if (permalinkResponse.ok) {
        permalink = permalinkResponse.permalink ?? undefined;
      }
    } catch {
      // Ignore permalink errors; continuing without link
    }

    const user = typeof (message as { user?: unknown }).user === 'string' ? (message as { user: string }).user : undefined;
    mentions.push({
      channel: channelId,
      text,
      user,
      ts,
      permalink,
    });
    processed.add(cacheKey);

    const threadTs = typeof (message as { thread_ts?: unknown }).thread_ts === 'string' ? (message as { thread_ts: string }).thread_ts : undefined;
    const root = threadTs ?? ts;
    if (root && Number.isFinite(numericTs)) {
      const existing = this.threadCheckpoints.get(root);
      if (!existing || numericTs > existing.lastTs) {
        this.threadCheckpoints.set(root, { channelId, lastTs: numericTs });
      }
    }
  }
}

const TOKEN_KEYS = [
  'slackToken',
  'token',
  'botToken',
  'slackBotToken',
  'slack_bot_token',
  'apiToken',
];

const CHANNEL_KEYS = ['defaultChannel', 'channel', 'channelId', 'channel_id', 'channelName'];
const SIGNING_SECRET_KEYS = ['signingSecret', 'signing_secret', 'clientSigningSecret'];

function resolveStringValue(values: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = values[key];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return undefined;
}

export function createSlackClientFromConfig(values: Record<string, unknown>): SlackClient {
  const token = resolveStringValue(values, TOKEN_KEYS) ?? '';
  const defaultChannel = resolveStringValue(values, CHANNEL_KEYS);
  const signingSecret = resolveStringValue(values, SIGNING_SECRET_KEYS);
  if (!token) {
    const providedKeys = Object.keys(values ?? {}).join(', ') || 'none';
    throw new Error(`Slack token is required (found keys: ${providedKeys})`);
  }
  return new SlackClient({ token, defaultChannel, signingSecret });
}
