import { pool } from '../db.js';
const AUTOMATION_TYPE = 'automation_pipeline';
function extractPipeline(metadata) {
    if (!metadata) {
        return null;
    }
    const parsed = typeof metadata === 'string'
        ? (() => {
            try {
                return JSON.parse(metadata);
            }
            catch {
                return null;
            }
        })()
        : metadata;
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const payload = parsed;
    if (!payload.pipeline || typeof payload.pipeline !== 'object') {
        return null;
    }
    return payload.pipeline;
}
export class PostgresAutomationRepository {
    async saveAutomation(name, pipeline) {
        const metadata = {
            version: 1,
            pipeline,
        };
        const updateResult = await pool.query(`
        UPDATE automations
           SET automation_type = $2,
               metadata = $3::jsonb,
               updated_at = NOW()
         WHERE LOWER(name) = LOWER($1)
      `, [name, AUTOMATION_TYPE, JSON.stringify(metadata)]);
        if (updateResult.rowCount === 0) {
            await pool.query(`
          INSERT INTO automations (name, automation_type, metadata)
          VALUES ($1, $2, $3::jsonb)
        `, [name, AUTOMATION_TYPE, JSON.stringify(metadata)]);
        }
    }
    async loadAutomation(name) {
        const { rows } = await pool.query(`
        SELECT metadata
          FROM automations
         WHERE LOWER(name) = LOWER($1)
         ORDER BY updated_at DESC
         LIMIT 1
      `, [name]);
        if (!rows.length) {
            return null;
        }
        const pipeline = extractPipeline(rows[0].metadata);
        return pipeline ?? null;
    }
}
