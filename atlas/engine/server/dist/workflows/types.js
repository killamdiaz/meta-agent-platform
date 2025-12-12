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
