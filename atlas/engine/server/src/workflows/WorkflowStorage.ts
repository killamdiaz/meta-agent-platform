import { z } from 'zod';
import { pool } from '../db.js';
import { workflowPlanSchema, type WorkflowPlan, type WorkflowRecord, type WorkflowRunRecord, type WorkflowRunStatus } from './types.js';

// Handles persistence of workflows, runs, and state snapshots.
export class WorkflowStorage {
  async saveWorkflow(plan: WorkflowPlan): Promise<WorkflowRecord> {
    const parsed = workflowPlanSchema.parse(plan);
    const { rows } = await pool.query(
      `INSERT INTO workflows (name, trigger, steps, required_nodes, missing_nodes)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
       ON CONFLICT (name) DO UPDATE SET
         trigger = EXCLUDED.trigger,
         steps = EXCLUDED.steps,
         required_nodes = EXCLUDED.required_nodes,
         missing_nodes = EXCLUDED.missing_nodes,
         updated_at = NOW()
       RETURNING id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at`,
      [
        parsed.name,
        JSON.stringify(parsed.trigger ?? {}),
        JSON.stringify(parsed.steps ?? []),
        JSON.stringify(parsed.requiredNodes ?? []),
        JSON.stringify(parsed.missingNodes ?? []),
      ],
    );
    return this.normalizeWorkflow(rows[0] as Record<string, unknown>);
  }

  async listWorkflows(): Promise<WorkflowRecord[]> {
    const { rows } = await pool.query(
      `SELECT id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at
         FROM workflows
        ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.normalizeWorkflow(row as Record<string, unknown>));
  }

  async getWorkflow(id: string): Promise<WorkflowRecord | null> {
    const { rows } = await pool.query(
      `SELECT id, name, trigger, steps, required_nodes, missing_nodes, created_at, updated_at
         FROM workflows
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    if (!rows.length) return null;
    return this.normalizeWorkflow(rows[0] as Record<string, unknown>);
  }

  async startRun(
    workflowId: string,
    eventPayload: Record<string, unknown>,
    initialState: Record<string, unknown>,
  ): Promise<WorkflowRunRecord> {
    const { rows } = await pool.query<WorkflowRunRecord>(
      `INSERT INTO workflow_runs (workflow_id, status, event_payload, state, current_step, started_at)
       VALUES ($1, 'running', $2::jsonb, $3::jsonb, NULL, NOW())
       RETURNING *`,
      [workflowId, JSON.stringify(eventPayload ?? {}), JSON.stringify(initialState ?? {})],
    );
    return this.parseRun(rows[0]);
  }

  async updateRunStatus(
    runId: string,
    status: WorkflowRunStatus,
    state: Record<string, unknown>,
    error?: string | null,
    currentStep?: string | null,
  ): Promise<WorkflowRunRecord> {
    const { rows } = await pool.query<WorkflowRunRecord>(
      `UPDATE workflow_runs
          SET status = $2,
              finished_at = CASE WHEN $2 IN ('completed','failed') THEN NOW() ELSE finished_at END,
              state = $3::jsonb,
              error = $4,
              current_step = $5
        WHERE id = $1
        RETURNING *`,
      [runId, status, JSON.stringify(state ?? {}), error ?? null, currentStep ?? null],
    );
    return this.parseRun(rows[0]);
  }

  async recordStepState(
    runId: string,
    stepId: string,
    state: Record<string, unknown>,
    logs: Array<string | Record<string, unknown>>,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO workflow_states (workflow_run_id, step_id, state, logs)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [runId, stepId, JSON.stringify(state ?? {}), JSON.stringify(logs ?? [])],
    );
  }

  private parseRun(row: unknown): WorkflowRunRecord {
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

  private normalizeWorkflow(row: Record<string, unknown>): WorkflowRecord {
    const rawTrigger = (row.trigger as WorkflowRecord['trigger']) ?? {};
    const rawType = (rawTrigger as { type?: string }).type;
    const normalizedType: WorkflowRecord['trigger']['type'] =
      rawType === 'time' || rawType === 'event' || rawType === 'log' || rawType === 'manual'
        ? rawType
        : 'manual';
    const trigger =
      rawTrigger && typeof rawTrigger === 'object' && 'type' in rawTrigger
        ? {
            type: normalizedType,
            schedule: (rawTrigger as { schedule?: string }).schedule,
            event: (rawTrigger as { event?: string }).event,
            description: (rawTrigger as { description?: string }).description,
          }
        : { type: 'manual' as const };

    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      trigger,
      steps: (row.steps as WorkflowPlan['steps']) ?? [],
      requiredNodes:
        (row.required_nodes as string[] | undefined) ??
        (row.requiredNodes as string[] | undefined) ??
        [],
      missingNodes:
        (row.missing_nodes as string[] | undefined) ??
        (row.missingNodes as string[] | undefined) ??
        [],
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
    };
  }
}
