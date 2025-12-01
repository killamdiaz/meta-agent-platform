import express from 'express';
import axios from 'axios';
import { config } from '../../../config.js';
import { resolveOrgId, resolveAccountId, fetchSlackIntegration } from '../../slack/api/shared.js';
import { SlackConnectorClient } from '../../slack/client/slackClient.js';
import { JiraClient } from '../client.js';
import { fetchAccessibleResources, upsertJiraToken, refreshJiraToken } from '../storage.js';
import { ingestJiraIssue, recordIntegrationNode } from '../../integrationNodes.js';
import { pool } from '../../../db.js';
import { Blob } from 'buffer';

const router = express.Router();

const ATLASSIAN_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_SCOPES = config.jiraScopes;

function buildRedirectUri(req: any) {
  return config.jiraRedirectUrl || `${req.protocol}://${req.get('host')}/connectors/jira/api/callback`;
}

router.get('/install', (req, res) => {
  if (!config.jiraClientId) {
    res.status(500).json({ message: 'JIRA_CLIENT_ID not configured' });
    return;
  }
  const orgId = resolveOrgId(req);
  const accountId = resolveAccountId(req);
  const redirectUri = buildRedirectUri(req);
  const state = encodeURIComponent(JSON.stringify({ org_id: orgId, account_id: accountId }));

  const url = new URL(ATLASSIAN_AUTHORIZE_URL);
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', config.jiraClientId);
  const scopes = ATLASSIAN_SCOPES.replace(/,/g, ' ');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent');

  res.redirect(url.toString());
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    const stateRaw = req.query.state as string | undefined;
    if (!code || !stateRaw) {
      res.status(400).json({ message: 'Missing code or state' });
      return;
    }
    let orgId: string | null = resolveOrgId(req);
    let accountId: string | null = resolveAccountId(req);
    try {
      const parsed = JSON.parse(decodeURIComponent(stateRaw));
      orgId = (parsed.org_id as string) ?? orgId;
      accountId = (parsed.account_id as string) ?? accountId;
    } catch (err) {
      console.warn('[jira-callback] failed to parse state', err);
    }
    if (!orgId) {
      res.status(400).json({ message: 'org_id required' });
      return;
    }
    const redirectUri = buildRedirectUri(req);
    const tokenResp = await axios.post(
      ATLASSIAN_TOKEN_URL,
      {
        grant_type: 'authorization_code',
        client_id: config.jiraClientId,
        client_secret: config.jiraClientSecret,
        code,
        redirect_uri: redirectUri
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const tokenData = tokenResp.data;
    const expires = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

    const resources = await fetchAccessibleResources(tokenData.access_token);
    const first = resources[0];
    await upsertJiraToken({
      org_id: orgId,
      account_id: accountId ?? undefined,
      jira_domain: first?.url ?? null,
      cloud_id: first?.id ?? null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expires,
      scopes: tokenData.scope ? String(tokenData.scope).split(' ') : []
    });

    await recordIntegrationNode(orgId, 'jira', { domain: first?.url });

    res.json({ status: 'connected', domain: first?.url });
  } catch (error: any) {
    const detail = error?.response?.data || error?.message || 'unknown_error';
    console.error('[jira-callback] failed', detail);
    res.status(500).json({ message: 'Jira OAuth failed', detail });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      res.status(400).json({ message: 'org_id required' });
      return;
    }
    const refreshed = await refreshJiraToken(orgId);
    if (!refreshed) {
      res.status(404).json({ message: 'No Jira connection found' });
      return;
    }
    res.json({ status: 'refreshed', expires_at: refreshed.expires_at });
  } catch (error) {
    console.error('[jira-refresh] failed', error);
    res.status(500).json({ message: 'Failed to refresh Jira token' });
  }
});

router.get('/status', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.json({ status: 'inactive', data: {} });
    return;
  }
  const { rows } = await pool.query(
    `SELECT jira_domain, cloud_id, expires_at FROM forge_jira_tokens WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (!rows[0]) {
    res.json({ status: 'inactive', data: {} });
    return;
  }
  res.json({ status: 'active', data: rows[0] });
});

// Core Jira routes
router.get('/projects', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const projects = await client.getProjects();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch projects' });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const project = await client.getProject(req.params.id);
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch project' });
  }
});

router.get('/issues/assigned', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const issues = await client.getAssignedIssues();
    for (const issue of issues.issues ?? []) {
      await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    }
    res.json(issues);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch issues' });
  }
});

router.post('/issues/search', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const issues = await client.searchIssues({
      jql: req.body?.jql,
      query: req.body?.query,
      status: req.body?.status,
      assignee: req.body?.assignee
    });
    for (const issue of issues.issues ?? []) {
      await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    }
    res.json(issues);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to search issues' });
  }
});

router.get('/issues/:key', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    res.json(issue);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch issue' });
  }
});

router.post('/issues', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const issue = await client.createIssue(req.body);
    await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    res.json(issue);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to create issue' });
  }
});

router.patch('/issues/:key', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    await client.updateIssue(req.params.key, req.body);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to update issue' });
  }
});

router.post('/issues/:key/comment', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const comment = await client.addComment(req.params.key, req.body);
    res.json(comment);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to add comment' });
  }
});

router.post('/issues/:key/attachments', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const form = new FormData();
    if (req.body?.files && Array.isArray(req.body.files)) {
      for (const file of req.body.files) {
        const buffer = Buffer.from(file.content, 'base64');
        const blob = new Blob([buffer], { type: 'application/octet-stream' }) as any;
        form.append('file', blob as any, file.filename);
      }
    }
    const result = await client.addAttachment(req.params.key, form);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to add attachment' });
  }
});

router.post('/issues/:key/transition', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const client = await JiraClient.fromOrg(orgId);
    const transitionId = req.body?.transitionId;
    const fields = req.body?.fields;
    if (!transitionId) {
      res.status(400).json({ message: 'transitionId required' });
      return;
    }
    await client.transitionIssue(req.params.key, transitionId, fields);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, resolveAccountId(req));
    res.json({ status: 'transitioned' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to transition issue' });
  }
});

// Webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const issue = event?.issue;
    const orgId = resolveOrgId(req);
    if (!orgId || !issue) {
      res.status(400).json({ message: 'org_id and issue required' });
      return;
    }
    await ingestJiraIssue(issue, orgId, resolveAccountId(req));

    // Optional Slack notify if connected
    const slackIntegration = await fetchSlackIntegration(orgId);
    const botToken = (slackIntegration?.data as { bot_token?: string })?.bot_token;
    if (botToken) {
      const slackClient = new SlackConnectorClient({ botToken });
      const summary = `Jira issue updated: ${issue.key} - ${issue.fields?.summary}`;
      const channel = (slackIntegration?.data as any)?.default_channel;
      if (channel) {
        await slackClient.postMessage({
          channel,
          text: summary
        });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[jira-webhook] failed', error);
    res.status(500).json({ message: 'Webhook failed' });
  }
});

export function buildJiraApiRouter() {
  return router;
}
