import type { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../../../config.js';
import { resolveOrgId, resolveAccountId, upsertSlackIntegration } from './shared.js';
import { recordIntegrationNode } from '../../integrationNodes.js';

export async function handleSlackActivate(req: Request, res: Response) {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    if (!code) {
      res.status(400).json({ message: 'Missing code parameter' });
      return;
    }

    const stateRaw = typeof req.query.state === 'string' ? req.query.state : null;
    let stateOrg: string | null = null;
    let stateAccount: string | null = null;
    let stateLicense: string | null = null;
    if (stateRaw) {
      try {
        const parsed = JSON.parse(decodeURIComponent(stateRaw));
        stateOrg = typeof parsed.org_id === 'string' ? parsed.org_id : null;
        stateAccount = typeof parsed.account_id === 'string' ? parsed.account_id : null;
        stateLicense = typeof parsed.license_key === 'string' ? parsed.license_key : null;
      } catch {
        stateOrg = null;
      }
    }

    const queryLicense = typeof req.query.license_key === 'string' ? req.query.license_key : null;
    const orgId = stateOrg ?? resolveOrgId(req);
    const accountId = stateAccount ?? resolveAccountId(req);
    const licenseKey = queryLicense ?? stateLicense;
    if (!orgId) {
      res.status(400).json({ message: 'org_id is required to activate Slack connector' });
      return;
    }

    const baseRedirect =
      config.slackRedirectUrl || `${req.protocol}://${req.get('host')}/connectors/slack/api/activate`;
    const redirectUri =
      licenseKey === null
        ? baseRedirect
        : `${baseRedirect}${baseRedirect.includes('?') ? '&' : '?'}license_key=${encodeURIComponent(licenseKey)}`;
    const payload = new URLSearchParams({
      code,
      client_id: config.slackClientId,
      client_secret: config.slackClientSecret,
      redirect_uri: redirectUri,
    });
    const response = await axios.post('https://slack.com/api/oauth.v2.access', payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = response.data;
    if (!data?.ok) {
      res.status(400).json({ message: data?.error ?? 'Slack OAuth failed' });
      return;
    }

    const integrationData = {
      access_token: data.authed_user?.access_token ?? null,
      bot_token: data.access_token,
      team_id: data.team?.id ?? null,
      team_name: data.team?.name ?? null,
      scope: data.scope,
      authed_user: data.authed_user,
    };

    await upsertSlackIntegration({
      orgId,
      accountId,
      data: integrationData,
      status: 'active',
    });

    await recordIntegrationNode(orgId, 'slack', { team: data.team?.name ?? data.team?.id });

    res.json({
      status: 'connected',
      team: data.team?.name ?? data.team?.id,
    });
  } catch (error) {
    console.error('[slack-oauth] activate failed', error);
    res.status(500).json({ message: 'Slack activation failed' });
  }
}
