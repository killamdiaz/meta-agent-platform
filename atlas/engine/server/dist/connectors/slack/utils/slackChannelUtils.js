export function buildThreadKey(channel, threadTs) {
    const safeChannel = channel ?? 'unknown';
    const safeThread = threadTs ?? 'root';
    return `${safeChannel}/${safeThread}`;
}
export async function resolveChannelLabel(client, channelId) {
    if (!channelId)
        return 'direct-message';
    try {
        const name = await client.fetchChannelName(channelId);
        return name ? `#${name}` : channelId;
    }
    catch {
        return channelId;
    }
}
