import { WebClient } from '@slack/web-api';

export interface SlackConnectorConfig {
  botToken: string;
  defaultChannel?: string;
}

export interface SlackPostMessageInput {
  channel: string;
  text: string;
  thread_ts?: string;
}

export class SlackConnectorClient {
  private readonly client: WebClient;
  private readonly defaultChannel?: string;

  constructor(config: SlackConnectorConfig) {
    this.client = new WebClient(config.botToken);
    this.defaultChannel = config.defaultChannel;
  }

  async postMessage(payload: SlackPostMessageInput) {
    const channel = payload.channel || this.defaultChannel;
    if (!channel) throw new Error('Slack channel is required to post a message');
    await this.client.chat.postMessage({
      channel,
      text: payload.text,
      thread_ts: payload.thread_ts,
    });
  }

  async postEphemeral(channel: string, user: string, text: string) {
    await this.client.chat.postEphemeral({ channel, user, text });
  }

  async fetchUser(userId: string) {
    const { user } = await this.client.users.info({ user: userId });
    return user;
  }

  async fetchChannelName(channelId: string) {
    const response = await this.client.conversations.info({ channel: channelId });
    const channel = response.channel;
    if (channel && typeof channel.name === 'string') {
      return channel.name;
    }
    return channelId;
  }
}
