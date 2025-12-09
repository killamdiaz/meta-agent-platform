import type { WorkflowNodeDefinition } from './types.js';

// Central prompt builder to keep all LLM instructions in one place.
export function buildWorkflowCompilerPrompt(userPrompt: string, nodes: WorkflowNodeDefinition[]): string {
  const catalog = nodes
    .map((node) => `- ${node.id}: ${node.description ?? 'no description provided'}`)
    .join('\n');

  return `
You are Atlas Forge's automation compiler. Convert the user's request into a WorkflowPlan JSON.
- Prefer existing nodes when possible.
- If a needed node is missing, add its id to "missingNodes".
- Always include a trigger, a name, and ordered steps.
- Steps may include sequential nodes and condition steps with simple boolean expressions using "state" or "event".

Available nodes:
${catalog}

Output ONLY valid JSON with this shape:
{
  "name": string,
  "trigger": { "type": "manual" | "time" | "event" | "log", "schedule"?: string, "event"?: string },
  "steps": [
    { "id": "step_1", "type": "node", "node": "atlas.notify.send", "inputs": { ... } },
    { "id": "cond_2", "type": "condition", "condition": "state.confidence > 0.8", "onTrue": "step_3", "onFalse": "step_4" }
  ],
  "requiredNodes": [],
  "missingNodes": []
}

User request:
${userPrompt}
`.trim();
}
