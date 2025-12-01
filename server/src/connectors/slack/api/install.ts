import type { Request, Response } from 'express';
import { config } from '../../../config.js';
import { resolveOrgId, resolveAccountId } from './shared.js';

export function handleSlackInstall(req: Request, res: Response) {
  if (!config.slackClientId) {
    res.status(500).json({ message: 'SLACK_CLIENT_ID not configured' });
    return;
  }
  const orgId = resolveOrgId(req);
  const accountId = resolveAccountId(req);
  const redirectUri =
    config.slackRedirectUrl || `${req.protocol}://${req.get('host')}/connectors/slack/api/activate`;
  const statePayload = encodeURIComponent(
    JSON.stringify({
      org_id: orgId,
      account_id: accountId,
    }),
  );
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', config.slackClientId);
  url.searchParams.set('scope', config.slackScopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', statePayload);

  res.redirect(url.toString());
}
