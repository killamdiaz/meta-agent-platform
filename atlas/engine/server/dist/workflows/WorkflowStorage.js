import { z } from 'zod';
import { pool } from '../db.js';
import { workflowPlanSchema } from './types.js';
// Handles persistence of workflows, runs, and state snapshots.
export class WorkflowStorage {
    async saveWorkflow(plan) {
        const parsed = workflowPlanSchema.parse(plan);
        const { rows } = await pool.query(`INSERT INTO workflows (name, trigger, steps, required_nodes, missing_nodes)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         trigger = EXCLUDED.trigger,
         steps = EXCLUDED.steps,
         required_nodes = EXCLUDED.required_nodes,
         missing_nodes = EXCLUDED.missing_nodes,
         updated_at = NOW()
       RETURNING id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at`, [
            parsed.name,
            JSON.stringify(parsed.trigger ?? {}),
            JSON.stringify(parsed.steps ?? []),
            JSON.stringify(parsed.requiredNodes ?? []),
            JSON.stringify(parsed.missingNodes ?? []),
        ]);
        return this.normalizeWorkflow(rows[0]);
    }
    async listWorkflows() {
        const { rows } = await pool.query(`SELECT id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at
         FROM workflows
        ORDER BY created_at DESC`);
        return rows.map((row) => this.normalizeWorkflow(row));
    }
    async getWorkflow(id) {
        const { rows } = await pool.query(`SELECT id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at
         FROM workflows
        WHERE id = $1
        LIMIT 1`, [id]);
        if (!rows.length)
            return null;
        return this.normalizeWorkflow(rows[0]);
    }
    async startRun(workflowId, eventPayload, initialState) {
        const { rows } = await pool.query(`INSERT INTO workflow_runs (workflow_id, status, event_payload, state, current_step, started_at)
       VALUES ($1, 'running', $2::jsonb, $3::jsonb, NULL, NOW())
       RETURNING *`, [workflowId, JSON.stringify(eventPayload ?? {}), JSON.stringify(initialState ?? {})]);
        return this.parseRun(rows[0]);
    }
    async updateRunStatus(runId, status, state, error, currentStep) {
        const { rows } = await pool.query(`UPDATE workflow_runs
          SET status = $2,
              finished_at = CASE WHEN $2 IN ('completed','failed') THEN NOW() ELSE finished_at END,
              state = $3::jsonb,
              error = $4,
              current_step = $5
        WHERE id = $1
        RETURNING *`, [runId, status, JSON.stringify(state ?? {}), error ?? null, currentStep ?? null]);
        return this.parseRun(rows[0]);
    }
    async recordStepState(runId, stepId, state, logs) {
        await pool.query(`INSERT INTO workflow_states (workflow_run_id, step_id, state, logs)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`, [runId, stepId, JSON.stringify(state ?? {}), JSON.stringify(logs ?? [])]);
    }
    parseRun(row) {
        const schema = z.object({
            id: z.string().uuid(),
            workflow_id: z.string().uuid(),
            status: z.enum(['pending', 'running', 'completed', 'failed']),
            event_payload: z.record(z.unknown()).nullable(),
            started_at: z.string(),
            finished_at: z.string().nullable(),
            error: z.string().nullable(),
            current_step: z.string().nullable(),
            state: z.record(z.unknown()).nullable(),
        });
        return schema.parse(row);
    }
    normalizeWorkflow(row) {
        const rawTrigger = row.trigger ?? {};
        const rawType = rawTrigger.type;
        const normalizedType = rawType === 'time' || rawType === 'event' || rawType === 'log' || rawType === 'manual'
            ? rawType
            : 'manual';
        const trigger = rawTrigger && typeof rawTrigger === 'object' && 'type' in rawTrigger
            ? {
                type: normalizedType,
                schedule: rawTrigger.schedule,
                event: rawTrigger.event,
                description: rawTrigger.description,
            }
            : { type: 'manual' };
        return {
            id: String(row.id),
            name: String(row.name ?? ''),
            trigger,
            steps: row.steps ?? [],
            requiredNodes: row.required_nodes ??
                row.requiredNodes ??
                [],
            missingNodes: row.missing_nodes ??
                row.missingNodes ??
                [],
            created_at: String(row.created_at ?? ''),
            updated_at: String(row.updated_at ?? ''),
        };
    }
}
