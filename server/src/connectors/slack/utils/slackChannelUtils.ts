import { SlackConnectorClient } from '../client/slackClient.js';

export function buildThreadKey(channel: string | undefined, threadTs: string | undefined) {
  const safeChannel = channel ?? 'unknown';
  const safeThread = threadTs ?? 'root';
  return `${safeChannel}/${safeThread}`;
}

export async function resolveChannelLabel(client: SlackConnectorClient, channelId?: string) {
  if (!channelId) return 'direct-message';
  try {
    const name = await client.fetchChannelName(channelId);
    return name ? `#${name}` : channelId;
  } catch {
    return channelId;
  }
}
