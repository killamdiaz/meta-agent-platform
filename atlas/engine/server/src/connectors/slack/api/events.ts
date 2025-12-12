import express from 'express';
import {
  resolveOrgId,
  resolveAccountId,
  fetchSlackIntegration,
  fetchSlackIntegrationByTeamId,
  upsertSlackIntegration,
} from './shared.js';
import { SlackConnectorClient } from '../client/slackClient.js';
import { handleAppMention } from '../events/appMention.js';
import { handleDirectMessage } from '../events/directMessage.js';
import { handleChannelMessage } from '../events/channelMessage.js';
import { handleFileShared } from '../events/fileShared.js';

type SlackEventEnvelope = {
  type: string;
  team_id?: string;
  api_app_id?: string;
  event?: {
    type: string;
    channel?: string;
    channel_type?: string;
    user?: string;
    text?: string;
    thread_ts?: string;
    ts?: string;
    subtype?: string;
    files?: unknown[];
  };
  challenge?: string;
};

export const slackEventsRouter = express.Router();

slackEventsRouter.post('/events', async (req, res) => {
  const payload = req.body as SlackEventEnvelope;

  if (payload.type === 'url_verification' && payload.challenge) {
    res.send(payload.challenge);
    return;
  }

  const event = payload.event;
  if (!event) {
    res.status(400).json({ message: 'Missing event payload' });
    return;
  }

  if (event.subtype === 'bot_message') {
    res.json({ ok: true });
    return;
  }

  const teamId = payload.team_id;
  let orgId = resolveOrgId(req) ?? null;
  let accountId = resolveAccountId(req) ?? null;

  let integration = orgId ? await fetchSlackIntegration(orgId) : null;
  if (!integration && teamId) {
    integration = await fetchSlackIntegrationByTeamId(teamId);
    if (integration) {
      orgId = integration.org_id;
      accountId = accountId ?? integration.account_id ?? null;
    }
  }

  if (!orgId) {
    res.status(400).json({ message: 'org_id required' });
    return;
  }

  const resolvedOrgId = orgId as string;
  const resolvedAccountId = accountId ?? undefined;

  const botToken = (integration?.data as { bot_token?: string })?.bot_token;
  if (!botToken || !integration) {
    res.status(401).json({ message: 'Slack connector not activated' });
    return;
  }

  // Mark integration as active when events flow succeeds.
  await upsertSlackIntegration({
    orgId: resolvedOrgId,
    accountId: resolvedAccountId,
    data: integration.data ?? { bot_token: botToken, team_id: teamId },
    status: 'active',
  });

  const slackClient = new SlackConnectorClient({ botToken });

  try {
    if (event.type === 'app_mention') {
      await handleAppMention(
        { text: event.text, user: event.user, channel: event.channel!, thread_ts: event.thread_ts ?? event.ts },
        { orgId: resolvedOrgId, accountId: resolvedAccountId, slackClient, teamId: payload.team_id, eventType: 'app_mention' },
      );
    } else if (event.type === 'message' && event.channel_type === 'im') {
      await handleDirectMessage(
        { text: event.text, user: event.user, channel: event.channel!, thread_ts: event.thread_ts ?? event.ts },
        { orgId: resolvedOrgId, accountId: resolvedAccountId, slackClient, teamId: payload.team_id, eventType: 'direct_message' },
      );
    } else if (event.type === 'message') {
      await handleChannelMessage(
        { text: event.text, user: event.user, channel: event.channel!, thread_ts: event.thread_ts ?? event.ts },
        { orgId: resolvedOrgId, accountId: resolvedAccountId, slackClient, teamId: payload.team_id, eventType: 'channel_message' },
      );
    } else if (event.type === 'file_shared') {
      await handleFileShared(
        {
          file: (event as { file?: unknown }).file as any,
          user: event.user,
          channel_id: event.channel,
        },
        { orgId: resolvedOrgId, accountId: resolvedAccountId, botToken },
      );
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[slack-events] handler failed', error);
    res.status(500).json({ message: 'Slack event handler failed' });
  }
});
