import type { WorkflowNodeDefinition } from '../types.js';

// Collects clarification answers before proceeding with the workflow.
const node: WorkflowNodeDefinition = {
  id: 'atlas.workflow.clarify',
  description: 'Ask the operator clarifying questions and capture structured answers.',
  inputs: {
    questions: { type: 'string[]', description: 'List of questions to ask the user' },
    topic: { type: 'string', description: 'Topic to clarify (e.g., logs, exhausts)' },
  },
  outputs: {
    responses: { type: 'record', description: 'Map of question to answer' },
    confirmed: { type: 'boolean', description: 'Whether clarifications were captured' },
  },
  executor: async () => {
    // This node is interactive; execution should be implemented by the host app.
    return {
      outputs: { responses: {}, confirmed: false },
      status: 'success',
    };
  },
};

export default node;
