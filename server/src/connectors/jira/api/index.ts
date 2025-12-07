import express from 'express';
import axios from 'axios';
import { config } from '../../../config.js';
import { resolveOrgId, resolveAccountId, fetchSlackIntegration } from '../../slack/api/shared.js';
import { SlackConnectorClient } from '../../slack/client/slackClient.js';
import { JiraClient } from '../client.js';
import { fetchAccessibleResources, upsertJiraToken, refreshJiraToken, fetchUserJiraTokens } from '../storage.js';
import { ingestJiraIssue, recordIntegrationNode } from '../../integrationNodes.js';
import { pool } from '../../../db.js';
import { Blob } from 'buffer';
import { normalizeJiraIssue } from '../normalize.js';

const router = express.Router();

const ATLASSIAN_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_SCOPES = [
  'offline_access',
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'manage:jira-webhook',
  'read:account',
  'read:me',
  // Granular scopes required by EX API
  'read:issue-details:jira',
  'read:issue-meta:jira',
  'read:project:jira',
  'read:issue:jira',
  'read:issue-changelog:jira'
].join(' ');

function buildRedirectUri(req: any) {
  return config.jiraRedirectUrl || `${req.protocol}://${req.get('host')}/connectors/jira/api/callback`;
}

router.get('/install', (req, res) => {
  if (!config.jiraClientId) {
    res.status(500).json({ message: 'JIRA_CLIENT_ID not configured' });
    return;
  }
  const orgId = resolveOrgId(req);
  const forgeUserId = resolveAccountId(req);
  const redirectUri = buildRedirectUri(req);
  const state = encodeURIComponent(JSON.stringify({ org_id: orgId, forge_user_id: forgeUserId }));

  const url = new URL(ATLASSIAN_AUTHORIZE_URL);
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', config.jiraClientId);
  url.searchParams.set('scope', ATLASSIAN_SCOPES.replace(/,/g, ' '));
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
    let forgeUserId: string | null = resolveAccountId(req);
    try {
      const parsed = JSON.parse(decodeURIComponent(stateRaw));
      orgId = (parsed.org_id as string) ?? orgId;
      forgeUserId = (parsed.forge_user_id as string) ?? forgeUserId;
    } catch (err) {
      console.warn('[jira-callback] failed to parse state', err);
    }
    if (!orgId || !forgeUserId) {
      res.status(400).json({ message: 'org_id and forge_user_id required' });
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
    console.log('SCOPES GRANTED BY ATLASSIAN:', tokenData.scope);

    const meResp = await axios.get('https://api.atlassian.com/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const me = meResp.data ?? {};
    const jiraAccountId = me.account_id || me.accountId;
    const jiraEmail = me.email;
    const jiraName = me.name;

    const resources = await fetchAccessibleResources(tokenData.access_token);
    const first = resources[0];
    console.log("Accessible resources:", resources);
    if (!first) {
      res.status(403).json({ message: 'No Jira project access. Ask admin to grant access.' });
      return;
    }
    await upsertJiraToken({
      org_id: orgId,
      forge_user_id: forgeUserId,
      jira_user_id: jiraAccountId ?? null,
      jira_domain: first?.url ?? null,
      cloud_id: first?.id ?? null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expires,
      scopes: tokenData.scope ? String(tokenData.scope).split(' ') : []
    });
    console.log("TOKEN SCOPES:", tokenData.scope);

    await recordIntegrationNode(orgId, 'jira', { domain: first?.url, user: jiraEmail ?? jiraName ?? jiraAccountId ?? 'jira-user' });

    res.json({ status: 'connected', domain: first?.url, jira_user_id: jiraAccountId, jira_email: jiraEmail, jira_name: jiraName });
  } catch (error: any) {
    const detail = error?.response?.data || error?.message || 'unknown_error';
    console.error('[jira-callback] failed', detail);
    res.status(500).json({ message: 'Jira OAuth failed', detail });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) {
      res.status(400).json({ message: 'org_id and forge_user_id required' });
      return;
    }
    const refreshed = await refreshJiraToken(orgId, forgeUserId);
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

router.post('/disconnect', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const accountId = resolveAccountId(req);
    if (!orgId) {
      res.status(400).json({ message: 'org_id required' });
      return;
    }
    await pool.query(
      `DELETE FROM forge_jira_tokens WHERE org_id = $1 AND account_id IS NOT DISTINCT FROM $2`,
      [orgId, accountId ?? null]
    );
    await pool.query(
      `UPDATE forge_integrations SET status = 'inactive', updated_at = NOW() WHERE org_id = $1 AND connector_type = 'jira'`,
      [orgId]
    );
    res.json({ status: 'inactive' });
  } catch (error: any) {
    console.error('[jira-disconnect] failed', error);
    res.status(500).json({ message: 'Failed to disconnect Jira' });
  }
});

router.get('/status', async (req, res) => {
  const orgId = resolveOrgId(req);
  const forgeUserId = resolveAccountId(req);
  if (!orgId || !forgeUserId) {
    res.json({ status: 'inactive', data: {} });
    return;
  }
  const { rows } = await pool.query(
    `SELECT jira_domain, cloud_id, expires_at, jira_user_id FROM forge_jira_tokens WHERE org_id = $1 AND account_id = $2 LIMIT 1`,
    [orgId, forgeUserId]
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
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    if (!tokens?.access_token || !tokens?.cloud_id) {
      return res.status(404).json({ message: 'No Jira connection found for this user' });
    }
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const projects = await client.getProjects();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch projects' });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    if (!tokens?.access_token || !tokens?.cloud_id) {
      return res.status(404).json({ message: 'No Jira connection found for this user' });
    }
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const project = await client.getProject(req.params.id);
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch project' });
  }
});

router.get('/issues/assigned', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);

    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });

    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);

    if (!tokens?.access_token || !tokens?.cloud_id) {
      return res.status(404).json({ message: 'No Jira connection found for this user' });
    }

    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const issues = await client.getAssignedIssues();

    for (const issue of issues.issues ?? []) {
      try {
        await ingestJiraIssue(issue, orgId, forgeUserId);
      } catch (err) {
        console.warn('[Jira ingest error]', err);
      }
    }

    res.json(issues);
  } catch (error: any) {
  console.error("[/issues/assigned ERROR]", error); // <-- ADD THIS LOGGING
  const message =
    error?.response?.data?.error ??
    error?.response?.data?.message ??
    error?.message ??
    "Failed to fetch issues";

  if (String(message).toLowerCase().includes("not connected")) {
    return res.status(404).json({ message });
  }

  return res.status(500).json({ message });
}
});

router.post('/issues/search', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const issues = await client.searchIssues({
      jql: req.body?.jql,
      query: req.body?.query,
      status: req.body?.status,
      assignee: req.body?.assignee
    });
    for (const issue of issues.issues ?? []) {
      await ingestJiraIssue(issue, orgId, forgeUserId);
    }
    res.json(issues);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to search issues' });
  }
});

router.post('/issues/similar', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ message: 'org_id required' });
    const { projectKey, summary, description, limit = 5 } = req.body || {};
    if (!summary && !description) {
      return res.status(400).json({ message: 'summary or description required' });
    }
    const text = [summary, description].filter(Boolean).join('\n');
    const { rows } = await pool.query(
      `
        SELECT ticket_id as key,
               title as summary,
               resolution as "rootCause",
               metadata->>'howSolved' as "howSolved",
               metadata->>'solvedBy' as "solvedBy",
               metadata->>'resolutionComment' as "resolutionComment",
               metadata->>'timeTaken' as "timeTaken",
               0 as "similarityScore"
        FROM jira_embeddings
        WHERE org_id = $1
          AND ($2::text IS NULL OR metadata->>'projectKey' = $2)
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [orgId, projectKey ?? null, limit],
    );
    res.json({ items: rows });
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to search similar issues' });
  }
});

router.get('/issues/:key', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, forgeUserId);
    const browseUrl = (tokens as any)?.jira_domain;
    res.json({ issue: normalizeJiraIssue(issue, browseUrl) });
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to fetch issue' });
  }
});

router.post('/issues/ingest', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    const issue = req.body?.issue;
    if (!orgId || !issue) return res.status(400).json({ message: 'org_id and issue required' });
    const statusName = (issue.fields?.status?.name || '').toLowerCase();
    const isClosed = ['done', 'resolved', 'closed'].some((s) => statusName.includes(s));
    if (!isClosed) {
      return res.status(200).json({ message: 'skipped_ingest_non_closed' });
    }
    await ingestJiraIssue(issue, orgId, forgeUserId);
    res.json({ message: 'ingested' });
  } catch (error: any) {
    console.error('[jira ingest] failed', error);
    res.status(500).json({ message: 'Failed to ingest issue' });
  }
});

router.post('/issues', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const issue = await client.createIssue(req.body);
    await ingestJiraIssue(issue, orgId, forgeUserId);
    res.json(issue);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to create issue' });
  }
});

router.patch('/issues/:key', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    await client.updateIssue(req.params.key, req.body);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, forgeUserId);
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to update issue' });
  }
});

router.post('/issues/:key/comment', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
    const comment = await client.addComment(req.params.key, req.body);
    res.json(comment);
  } catch (error: any) {
    res.status(500).json({ message: error?.message ?? 'Failed to add comment' });
  }
});

router.post('/issues/:key/attachments', async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens, orgId, forgeUserId);
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
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !forgeUserId) return res.status(400).json({ message: 'org_id and forge_user_id required' });
    const tokens = await fetchUserJiraTokens(orgId, forgeUserId);
    const client = await JiraClient.fromTokens(tokens);
    const transitionId = req.body?.transitionId;
    const fields = req.body?.fields;
    if (!transitionId) {
      res.status(400).json({ message: 'transitionId required' });
      return;
    }
    await client.transitionIssue(req.params.key, transitionId, fields);
    const issue = await client.getIssue(req.params.key);
    await ingestJiraIssue(issue, orgId, forgeUserId);
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
    const forgeUserId = resolveAccountId(req);
    if (!orgId || !issue) {
      res.status(400).json({ message: 'org_id and issue required' });
      return;
    }
    await ingestJiraIssue(issue, orgId, forgeUserId);

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
