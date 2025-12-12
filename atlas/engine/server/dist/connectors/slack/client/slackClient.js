import { WebClient } from '@slack/web-api';
export class SlackConnectorClient {
    constructor(config) {
        this.client = new WebClient(config.botToken);
        this.defaultChannel = config.defaultChannel;
    }
    async postMessage(payload) {
        const channel = payload.channel || this.defaultChannel;
        if (!channel)
            throw new Error('Slack channel is required to post a message');
        await this.client.chat.postMessage({
            channel,
            text: payload.text,
            thread_ts: payload.thread_ts,
            blocks: payload.blocks,
        });
    }
    async postEphemeral(channel, user, text) {
        await this.client.chat.postEphemeral({ channel, user, text });
    }
    async fetchUser(userId) {
        const { user } = await this.client.users.info({ user: userId });
        return user;
    }
    async fetchChannelName(channelId) {
        const response = await this.client.conversations.info({ channel: channelId });
        const channel = response.channel;
        if (channel && typeof channel.name === 'string') {
            return channel.name;
        }
        return channelId;
    }
}
