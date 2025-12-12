import { resolveOrgId } from './shared.js';
import { pool } from '../../../db.js';
export async function handleSlackDeactivate(req, res) {
    const orgId = resolveOrgId(req);
    if (!orgId) {
        res.status(400).json({ message: 'org_id is required to deactivate Slack connector' });
        return;
    }
    await pool.query(`UPDATE forge_integrations SET status = 'inactive', updated_at = NOW() WHERE org_id = $1 AND connector_type = 'slack'`, [orgId]);
    res.json({ status: 'inactive' });
}
