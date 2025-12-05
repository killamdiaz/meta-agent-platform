import type { Request } from 'express';
import { pool } from '../../../db.js';
import { config } from '../../../config.js';

export type SlackIntegrationRow = {
  id: string;
  org_id: string;
  account_id: string | null;
  connector_type: string;
  data: Record<string, unknown>;
  status: string;
};

export function resolveOrgId(req: Request) {
  return (
    (req.headers['x-org-id'] as string) ||
    (typeof req.query.org_id === 'string' ? req.query.org_id : null) ||
    (config.defaultOrgId || null)
  );
}

export function resolveAccountId(req: Request) {
  return (
    (req.headers['x-account-id'] as string) ||
    (typeof req.query.account_id === 'string' ? req.query.account_id : null) ||
    (config.defaultAccountId || null)
  );
}

export async function upsertSlackIntegration({
  orgId,
  accountId,
  data,
  status = 'active',
}: {
  orgId: string;
  accountId?: string | null;
  data: Record<string, unknown>;
  status?: string;
}) {
  await pool.query(
    `
      INSERT INTO forge_integrations (org_id, account_id, connector_type, data, status)
      VALUES ($1, $2, 'slack', $3, $4)
      ON CONFLICT (org_id, connector_type)
      DO UPDATE SET data = $3, status = $4, updated_at = NOW()
    `,
    [orgId, accountId ?? null, data, status],
  );
}

export async function fetchSlackIntegration(orgId: string): Promise<SlackIntegrationRow | null> {
  const { rows } = await pool.query<SlackIntegrationRow>(
    `SELECT * FROM forge_integrations WHERE org_id = $1 AND connector_type = 'slack' LIMIT 1`,
    [orgId],
  );
  return rows[0] ?? null;
}

export async function fetchSlackIntegrationByTeamId(teamId?: string | null): Promise<SlackIntegrationRow | null> {
  if (!teamId) return null;
  const { rows } = await pool.query<SlackIntegrationRow>(
    `SELECT * FROM forge_integrations WHERE connector_type = 'slack' AND data->>'team_id' = $1 LIMIT 1`,
    [teamId],
  );
  return rows[0] ?? null;
}
