import { pool } from '../../../db.js';
import { config } from '../../../config.js';
export function resolveOrgId(req) {
    return (req.headers['x-org-id'] ||
        (typeof req.query.org_id === 'string' ? req.query.org_id : null) ||
        (config.defaultOrgId || null));
}
export function resolveAccountId(req) {
    return (req.headers['x-account-id'] ||
        (typeof req.query.account_id === 'string' ? req.query.account_id : null) ||
        (config.defaultAccountId || null));
}
export async function upsertSlackIntegration({ orgId, accountId, data, status = 'active', }) {
    await pool.query(`
      INSERT INTO forge_integrations (org_id, account_id, connector_type, data, status)
      VALUES ($1, $2, 'slack', $3, $4)
      ON CONFLICT (org_id, connector_type)
      DO UPDATE SET data = $3, status = $4, updated_at = NOW()
    `, [orgId, accountId ?? null, data, status]);
}
export async function fetchSlackIntegration(orgId) {
    const { rows } = await pool.query(`SELECT * FROM forge_integrations WHERE org_id = $1 AND connector_type = 'slack' LIMIT 1`, [orgId]);
    return rows[0] ?? null;
}
export async function fetchSlackIntegrationByTeamId(teamId) {
    if (!teamId)
        return null;
    const { rows } = await pool.query(`SELECT * FROM forge_integrations WHERE connector_type = 'slack' AND data->>'team_id' = $1 LIMIT 1`, [teamId]);
    return rows[0] ?? null;
}
