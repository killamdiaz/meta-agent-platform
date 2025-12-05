import axios from 'axios';
import { pool } from '../../db.js';
import { config } from '../../config.js';

export interface JiraTokenRecord {
  org_id: string;
  forge_user_id: string;
  jira_user_id?: string | null;
  jira_domain?: string | null;
  cloud_id?: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scopes: string[];
}

const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ATLASSIAN_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

export async function upsertJiraToken(record: JiraTokenRecord) {
  await pool.query(
    `
    INSERT INTO forge_jira_tokens (org_id, account_id, jira_user_id, jira_domain, cloud_id, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    ON CONFLICT (org_id, account_id) DO UPDATE
      SET jira_user_id = EXCLUDED.jira_user_id,
          jira_domain = EXCLUDED.jira_domain,
          cloud_id = EXCLUDED.cloud_id,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          scopes = EXCLUDED.scopes,
          updated_at = NOW()
    `,
    [
      record.org_id,
      record.forge_user_id ?? null,
      record.jira_user_id ?? null,
      record.jira_domain ?? null,
      record.cloud_id ?? null,
      record.access_token,
      record.refresh_token,
      record.expires_at,
      record.scopes
    ]
  );
}

export async function getJiraToken(orgId: string, forgeUserId: string): Promise<JiraTokenRecord | null> {
  const { rows } = await pool.query(
    `SELECT org_id, account_id as forge_user_id, jira_user_id, jira_domain, cloud_id, access_token, refresh_token, expires_at, scopes FROM forge_jira_tokens WHERE org_id = $1 AND account_id = $2 LIMIT 1`,
    [orgId, forgeUserId]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    org_id: row.org_id,
    forge_user_id: row.forge_user_id,
    jira_user_id: row.jira_user_id,
    jira_domain: row.jira_domain,
    cloud_id: row.cloud_id,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: new Date(row.expires_at),
    scopes: row.scopes ?? []
  };
}

export async function refreshJiraToken(orgId: string, forgeUserId: string): Promise<JiraTokenRecord | null> {
  const existing = await getJiraToken(orgId, forgeUserId);
  if (!existing) return null;

  const payload = {
    grant_type: 'refresh_token',
    client_id: config.jiraClientId,
    client_secret: config.jiraClientSecret,
    refresh_token: existing.refresh_token
  };

  const response = await axios.post(ATLASSIAN_TOKEN_URL, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  const data = response.data;
  const expires = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  const updated: JiraTokenRecord = {
    ...existing,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing.refresh_token,
    expires_at: expires,
    scopes: data.scope ? String(data.scope).split(' ') : existing.scopes
  };
  await upsertJiraToken(updated);
  return updated;
}

export async function fetchAccessibleResources(accessToken: string) {
  const { data } = await axios.get(ATLASSIAN_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return data as Array<{ id: string; name: string; url: string; scopes: string[] }>;
}

export async function fetchUserJiraTokens(orgId: string, forgeUserId: string) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM forge_jira_tokens
    WHERE org_id = $1 AND account_id = $2
    LIMIT 1
    `,
    [orgId, forgeUserId]
  );
  return rows[0] ?? null;
}
