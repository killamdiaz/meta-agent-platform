import express, { Router } from 'express';
import { handleSlackInstall } from './install.js';
import { handleSlackActivate } from './activate.js';
import { handleSlackDeactivate } from './deactivate.js';
import { slackEventsRouter } from './events.js';
import { resolveOrgId, resolveAccountId, fetchSlackIntegration } from './shared.js';
import { SlackConnectorClient } from '../client/slackClient.js';
import { handleKbCommand } from '../commands/kb.js';
import { handleExplainCommand } from '../commands/explain.js';
import { handleCompareCommand } from '../commands/compare.js';
import { handleDiagramCommand } from '../commands/diagram.js';
import { handleFormatCommand } from '../commands/format.js';

export function buildSlackApiRouter() {
  const router = Router();
  router.get('/install', handleSlackInstall);
  router.get('/activate', handleSlackActivate);
  router.post('/deactivate', handleSlackDeactivate);
  router.get('/status', async (req, res) => {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      res.json({ status: 'inactive', data: {} });
      return;
    }
    const integration = await fetchSlackIntegration(orgId);
    res.json({
      status: integration?.status ?? 'inactive',
      data: integration?.data ?? {},
    });
  });

  router.use(slackEventsRouter);
  router.post('/commands', express.urlencoded({ extended: true }), async (req, res) => {
    const payload = req.body as Record<string, string>;
    const orgId = resolveOrgId(req) ?? payload.team_id;
    const accountId = resolveAccountId(req);
    if (!orgId) {
      res.status(400).json({ message: 'org_id required' });
      return;
    }
    const integration = await fetchSlackIntegration(orgId);
    const botToken = (integration?.data as { bot_token?: string })?.bot_token;
    if (!botToken) {
      res.status(401).json({ message: 'Slack connector not activated' });
      return;
    }
    const slackClient = new SlackConnectorClient({ botToken });
    const command = payload.command ?? '';
    const text = payload.text ?? '';
    const channel = payload.channel_id ?? payload.channel ?? '';
    const user = payload.user_id ?? '';
    const threadTs = payload.thread_ts;

    const ctx = { orgId, accountId: accountId ?? undefined, channel, user, text, threadTs, slackClient };
    if (command.includes('kb')) await handleKbCommand(ctx);
    else if (command.includes('explain')) await handleExplainCommand(ctx);
    else if (command.includes('compare')) await handleCompareCommand(ctx);
    else if (command.includes('diagram')) await handleDiagramCommand(ctx);
    else if (command.includes('format')) await handleFormatCommand(ctx);

    res.json({ text: 'Working on it…' });
  });
  return router;
}
