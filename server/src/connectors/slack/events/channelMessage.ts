import { handleRagMessage } from '../handlers/ragHandler.js';
import { recordSlackMessage } from '../utils/slackThreadMemoryAdapter.js';
import type { SlackConnectorClient } from '../client/slackClient.js';

export interface ChannelMessageEvent {
  text?: string;
  user?: string;
  channel: string;
  thread_ts?: string;
}

export interface SlackEventContext {
  orgId: string;
  accountId?: string;
  slackClient: SlackConnectorClient;
  teamId?: string;
  eventType: string;
}

export async function handleChannelMessage(event: ChannelMessageEvent, ctx: SlackEventContext) {
  const text = (event.text ?? '').trim();
  if (!text) return;

  // Always ingest channel messages as context.
  await recordSlackMessage(
    {
      text,
      user: event.user,
      channel: event.channel,
      thread_ts: event.thread_ts,
    },
    { orgId: ctx.orgId, accountId: ctx.accountId },
  );

  // Only respond if the message appears to target the bot or mention Slack automation terms.
  const shouldRespond = /@|atlas|forge|workflow|automation/i.test(text);
  if (!shouldRespond) {
    return;
  }

  await handleRagMessage({
    orgId: ctx.orgId,
    accountId: ctx.accountId,
    channel: event.channel,
    user: event.user,
    text,
    threadTs: event.thread_ts,
    slackClient: ctx.slackClient,
    slackMetadata: {
      team_id: ctx.teamId,
      user_id: event.user,
      channel_id: event.channel,
      event_type: ctx.eventType,
    },
  });
}
