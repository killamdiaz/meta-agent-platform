import { workflowPlanSchema } from './types.js';
import { buildWorkflowCompilerPrompt } from './prompts.js';
import { routeMessage } from '../llm/router.js';
// Converts natural language instructions into structured WorkflowPlan objects using the LLM router.
export class WorkflowCompilerService {
    constructor(registry, generator) {
        this.registry = registry;
        this.generator = generator;
    }
    async compile(prompt) {
        if (!prompt || !prompt.trim()) {
            throw new Error('Prompt is required to compile a workflow');
        }
        await this.registry.ensureLoaded();
        const availableNodes = this.registry.list();
        const llmPrompt = buildWorkflowCompilerPrompt(prompt, availableNodes);
        const raw = await routeMessage({
            prompt: llmPrompt,
            intent: 'workflow_compiler',
        });
        const parsedPlan = this.parsePlan(raw);
        const normalizedPlan = this.postProcessPlan(parsedPlan, prompt);
        const missing = this.registry.findMissingNodes(normalizedPlan);
        const mergedMissing = Array.from(new Set([...(normalizedPlan.missingNodes ?? []), ...missing]));
        if (mergedMissing.length > 0) {
            await this.generator.generateMissingNodes(mergedMissing);
        }
        return {
            ...normalizedPlan,
            requiredNodes: normalizedPlan.requiredNodes ?? [],
            missingNodes: mergedMissing,
        };
    }
    parsePlan(raw) {
        const jsonCandidate = this.extractJson(raw);
        const parsed = workflowPlanSchema.safeParse(jsonCandidate);
        if (parsed.success) {
            return parsed.data;
        }
        console.warn('[workflow-compiler] failed to parse LLM response, falling back to minimal plan', {
            issues: parsed.error.issues,
            raw,
        });
        return {
            name: 'Generated Workflow',
            trigger: { type: 'manual' },
            steps: [],
            requiredNodes: [],
            missingNodes: [],
        };
    }
    extractJson(raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            // continue
        }
        const fencedMatch = raw.match(/```json([\s\S]*?)```/i);
        if (fencedMatch?.[1]) {
            try {
                return JSON.parse(fencedMatch[1]);
            }
            catch {
                // continue
            }
        }
        const braceIndex = raw.indexOf('{');
        const lastBraceIndex = raw.lastIndexOf('}');
        if (braceIndex >= 0 && lastBraceIndex > braceIndex) {
            const slice = raw.slice(braceIndex, lastBraceIndex + 1);
            try {
                return JSON.parse(slice);
            }
            catch {
                // ignore
            }
        }
        return {};
    }
    // Enforce workflow rules post-LLM: dedupe conditions, add clarifications for log/exhaust flows.
    postProcessPlan(plan, prompt) {
        const next = {
            ...plan,
            steps: [...(plan.steps ?? [])],
            requiredNodes: plan.requiredNodes ?? [],
            missingNodes: plan.missingNodes ?? [],
        };
        // Rule 1: deduplicate identical condition blocks and rewrite references.
        const conditionMap = new Map();
        const idRemap = new Map();
        const dedupedSteps = [];
        for (const step of next.steps) {
            if (step.type !== 'condition') {
                dedupedSteps.push(step);
                continue;
            }
            const normalized = (step.condition ?? '').trim().toLowerCase();
            if (!normalized) {
                dedupedSteps.push(step);
                continue;
            }
            const existingId = conditionMap.get(normalized);
            if (existingId) {
                idRemap.set(step.id, existingId);
                continue;
            }
            conditionMap.set(normalized, step.id);
            dedupedSteps.push(step);
        }
        const rewriteRef = (id) => {
            if (!id)
                return id;
            return idRemap.get(id) ?? id;
        };
        next.steps = dedupedSteps.map((step) => {
            if (step.type === 'condition') {
                return {
                    ...step,
                    onTrue: rewriteRef(step.onTrue),
                    onFalse: rewriteRef(step.onFalse),
                };
            }
            return {
                ...step,
                onSuccess: rewriteRef(step.onSuccess),
                onFailure: rewriteRef(step.onFailure),
            };
        });
        // Rule 2 & 3: clarify ambiguous log/exhaust workflows before executing nodes.
        const lowerPrompt = prompt.toLowerCase();
        const referencesLogs = /log|logs|exhaust/i.test(lowerPrompt);
        const hasExhaustInput = next.steps.some((step) => step.type === 'node' &&
            Object.keys(step.inputs ?? {}).some((key) => key.toLowerCase().includes('exhaust'))) || next.requiredNodes.some((id) => id.toLowerCase().includes('exhaust'));
        if (referencesLogs && !hasExhaustInput) {
            const clarifyStepId = 'clarify_exhaust';
            const clarifyNodeId = 'atlas.workflow.clarify';
            next.steps = [
                {
                    id: clarifyStepId,
                    type: 'node',
                    node: clarifyNodeId,
                    name: 'Clarify exhaust source',
                    inputs: {
                        questions: [
                            'Which exhaust source should I monitor?',
                            'What error pattern should I watch for?',
                            'What severity threshold should trigger actions?',
                            'Should I create a task, send a notification, or both?',
                        ],
                        topic: 'logs',
                    },
                    onSuccess: next.steps[0]?.id,
                },
                ...next.steps,
            ];
            if (!next.requiredNodes.includes(clarifyNodeId)) {
                next.requiredNodes.push(clarifyNodeId);
            }
        }
        return next;
    }
}
