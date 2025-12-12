import { SlackCommandContext } from './types.js';

export async function handleKbCommand(ctx: SlackCommandContext) {
  const text =
    'Atlas Forge is connected. Upload files or mention me in channels to ingest Slack messages into the shared knowledge base.';
  await ctx.slackClient.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text,
  });
}
