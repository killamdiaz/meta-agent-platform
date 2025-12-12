import { NodeRegistry } from './NodeRegistry.js';
import { WorkflowStorage } from './WorkflowStorage.js';
import type { WorkflowRecord, WorkflowStep } from './types.js';

type RunOptions = {
  eventPayload?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
};

// Executes compiled workflows step-by-step while persisting run history and state snapshots.
export class WorkflowEngine {
  constructor(private readonly registry: NodeRegistry, private readonly storage: WorkflowStorage) {}

  async run(workflowId: string, options: RunOptions = {}) {
    await this.registry.ensureLoaded();
    const workflow = await this.storage.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const eventPayload = options.eventPayload ?? {};
    const state: Record<string, unknown> = { ...(options.initialState ?? {}) };
    const run = await this.storage.startRun(workflowId, eventPayload, state);

    const stepsById = new Map<string, WorkflowStep>();
    workflow.steps.forEach((step) => stepsById.set(step.id, step));

    let currentStepId: string | null = workflow.steps[0]?.id ?? null;
    const visited = new Set<string>();

    try {
      while (currentStepId !== null) {
        const stepId: string = currentStepId;
        if (visited.has(stepId)) {
          throw new Error(`Detected loop while executing step ${stepId}`);
        }
        visited.add(stepId);

        const step = stepsById.get(stepId);
        if (!step) {
          throw new Error(`Step ${stepId} not found in workflow`);
        }

        const stepLogs: Array<string | Record<string, unknown>> = [
          `Starting step ${stepId} (${step.type})`,
        ];
        await this.storage.recordStepState(run.id, stepId, state, stepLogs);

        if (step.type === 'condition') {
          const result = this.evaluateCondition(step.condition, state, eventPayload);
          state[`condition:${step.id}`] = result;
          stepLogs.push({ condition: step.condition, result });
          await this.storage.recordStepState(run.id, stepId, state, stepLogs);
          currentStepId = result
            ? step.onTrue ?? this.nextSequential(workflow, stepId)
            : step.onFalse ?? this.nextSequential(workflow, stepId);
          continue;
        }

        const nodeDef = this.registry.get(step.node);
        if (!nodeDef || !nodeDef.executor) {
          throw new Error(`Node ${step.node} is not registered or missing an executor`);
        }

        const logger = (message: string, detail?: Record<string, unknown>) => {
          const entry = detail ? { message, detail } : message;
          stepLogs.push(entry);
        };

        const result = await nodeDef.executor({
          inputs: step.inputs ?? {},
          state,
          event: eventPayload,
          logger,
          runId: run.id,
        });

        if (result.outputs) {
          // Merge outputs into global state and under the step namespace.
          state[step.id] = result.outputs;
          Object.entries(result.outputs).forEach(([key, value]) => {
            const safeKey = `${step.id}.${key}`;
            state[safeKey] = value;
          });
        }

        const status = result.status ?? 'success';
        stepLogs.push({ status, outputs: result.outputs ?? {} });
        await this.storage.recordStepState(run.id, stepId, state, stepLogs);

        if (status === 'error') {
          throw new Error(result.error ?? `Node ${step.node} reported error`);
        }

        currentStepId = step.onSuccess ?? this.nextSequential(workflow, stepId);
      }

      await this.storage.updateRunStatus(run.id, 'completed', state, null, null);
      return { runId: run.id, status: 'completed', state };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.storage.updateRunStatus(run.id, 'failed', state, message, currentStepId);
      throw error;
    }
  }

  private nextSequential(workflow: WorkflowRecord, currentStepId: string): string | null {
    const index = workflow.steps.findIndex((step) => step.id === currentStepId);
    if (index === -1) {
      return null;
    }
    return workflow.steps[index + 1]?.id ?? null;
  }

  private evaluateCondition(expression: string, state: Record<string, unknown>, event: unknown): boolean {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('state', 'event', `return Boolean(${expression});`);
      return Boolean(fn(state, event));
    } catch (error) {
      console.warn('[workflow-engine] condition evaluation failed', { expression, error });
      return false;
    }
  }
}
