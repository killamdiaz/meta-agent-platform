import { workflowPlanSchema, type WorkflowPlan } from './types.js';
import { NodeRegistry } from './NodeRegistry.js';
import { AutoNodeGenerator } from './AutoNodeGenerator.js';
import { buildWorkflowCompilerPrompt } from './prompts.js';
import { routeMessage } from '../llm/router.js';

// Converts natural language instructions into structured WorkflowPlan objects using the LLM router.
export class WorkflowCompilerService {
  constructor(private readonly registry: NodeRegistry, private readonly generator: AutoNodeGenerator) {}

  async compile(prompt: string): Promise<WorkflowPlan> {
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
    const missing = this.registry.findMissingNodes(parsedPlan);
    const mergedMissing = Array.from(new Set([...(parsedPlan.missingNodes ?? []), ...missing]));

    if (mergedMissing.length > 0) {
      await this.generator.generateMissingNodes(mergedMissing);
    }

    return {
      ...parsedPlan,
      requiredNodes: parsedPlan.requiredNodes ?? [],
      missingNodes: mergedMissing,
    };
  }

  private parsePlan(raw: string): WorkflowPlan {
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

  private extractJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      // continue
    }

    const fencedMatch = raw.match(/```json([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1]);
      } catch {
        // continue
      }
    }

    const braceIndex = raw.indexOf('{');
    const lastBraceIndex = raw.lastIndexOf('}');
    if (braceIndex >= 0 && lastBraceIndex > braceIndex) {
      const slice = raw.slice(braceIndex, lastBraceIndex + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // ignore
      }
    }

    return {};
  }
}
