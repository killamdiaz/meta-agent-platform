import { config } from '../../../config.js';
import { resolveOrgId, resolveAccountId } from './shared.js';
export function handleSlackInstall(req, res) {
    if (!config.slackClientId) {
        res.status(500).json({ message: 'SLACK_CLIENT_ID not configured' });
        return;
    }
    const licenseKey = typeof req.query.license_key === 'string' ? req.query.license_key : null;
    const orgId = resolveOrgId(req);
    const accountId = resolveAccountId(req);
    const baseRedirect = config.slackRedirectUrl || `${req.protocol}://${req.get('host')}/connectors/slack/api/activate`;
    const redirectUri = licenseKey === null
        ? baseRedirect
        : `${baseRedirect}${baseRedirect.includes('?') ? '&' : '?'}license_key=${encodeURIComponent(licenseKey)}`;
    const statePayload = encodeURIComponent(JSON.stringify({
        org_id: orgId,
        account_id: accountId,
        license_key: licenseKey,
    }));
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', config.slackClientId);
    url.searchParams.set('scope', config.slackScopes);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', statePayload);
    res.redirect(url.toString());
}
