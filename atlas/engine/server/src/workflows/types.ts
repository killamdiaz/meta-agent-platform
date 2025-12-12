import { z } from 'zod';

// Shared workflow trigger schema describing how a workflow is activated.
export const workflowTriggerSchema = z.object({
  type: z.enum(['manual', 'time', 'event', 'log']).default('manual'),
  schedule: z.string().optional(),
  event: z.string().optional(),
  description: z.string().optional(),
});

// Workflow steps can either be executable nodes or conditional branches.
export const workflowStepSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('node'),
    node: z.string(),
    name: z.string().optional(),
    inputs: z.record(z.unknown()).default({}).optional(),
    onSuccess: z.string().optional(),
    onFailure: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('condition'),
    condition: z.string(),
    description: z.string().optional(),
    onTrue: z.string().optional(),
    onFalse: z.string().optional(),
  }),
]);

// Primary workflow planning schema produced by the compiler.
export const workflowPlanSchema = z.object({
  name: z.string(),
  trigger: workflowTriggerSchema,
  steps: z.array(workflowStepSchema),
  requiredNodes: z.array(z.string()).default([]),
  missingNodes: z.array(z.string()).default([]),
});

// Stored workflow schema used by persistence and the execution engine.
export const workflowRecordSchema = workflowPlanSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowPlan = z.infer<typeof workflowPlanSchema>;
export type WorkflowRecord = z.infer<typeof workflowRecordSchema>;

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  event_payload: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  current_step: string | null;
  state: Record<string, unknown> | null;
}

export type WorkflowNodeIO = string | { type: string; description?: string };

export interface NodeExecutionContext {
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  event?: unknown;
  logger: (message: string, detail?: Record<string, unknown>) => void;
  runId?: string;
}

export interface NodeExecutionResult {
  outputs?: Record<string, unknown>;
  status?: 'success' | 'error';
  error?: string;
}

export type WorkflowNodeExecutor = (context: NodeExecutionContext) => Promise<NodeExecutionResult>;

export interface WorkflowNodeDefinition {
  id: string;
  description?: string;
  inputs: Record<string, WorkflowNodeIO>;
  outputs: Record<string, WorkflowNodeIO>;
  tags?: string[];
  executor?: WorkflowNodeExecutor;
  examples?: string[];
}
