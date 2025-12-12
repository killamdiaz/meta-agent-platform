import { pool } from '../db.js';
import type { AutomationPipeline } from './types.js';
import type { AutomationRepository } from './AutomationSessionManager.js';

const AUTOMATION_TYPE = 'automation_pipeline';

interface AutomationRow {
  metadata: unknown;
}

function extractPipeline(metadata: unknown): AutomationPipeline | null {
  if (!metadata) {
    return null;
  }
  const parsed =
    typeof metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(metadata) as { pipeline?: unknown };
          } catch {
            return null;
          }
        })()
      : (metadata as { pipeline?: unknown });
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const payload = parsed as { pipeline?: unknown };
  if (!payload.pipeline || typeof payload.pipeline !== 'object') {
    return null;
  }
  return payload.pipeline as AutomationPipeline;
}

export class PostgresAutomationRepository implements AutomationRepository {
  async saveAutomation(name: string, pipeline: AutomationPipeline): Promise<void> {
    const metadata = {
      version: 1,
      pipeline,
    };
    const updateResult = await pool.query(
      `
        UPDATE automations
           SET automation_type = $2,
               metadata = $3::jsonb,
               updated_at = NOW()
         WHERE LOWER(name) = LOWER($1)
      `,
      [name, AUTOMATION_TYPE, JSON.stringify(metadata)],
    );
    if (updateResult.rowCount === 0) {
      await pool.query(
        `
          INSERT INTO automations (name, automation_type, metadata)
          VALUES ($1, $2, $3::jsonb)
        `,
        [name, AUTOMATION_TYPE, JSON.stringify(metadata)],
      );
    }
  }

  async loadAutomation(name: string): Promise<AutomationPipeline | null> {
    const { rows } = await pool.query<AutomationRow>(
      `
        SELECT metadata
          FROM automations
         WHERE LOWER(name) = LOWER($1)
         ORDER BY updated_at DESC
         LIMIT 1
      `,
      [name],
    );
    if (!rows.length) {
      return null;
    }
    const pipeline = extractPipeline(rows[0].metadata);
    return pipeline ?? null;
  }
}
