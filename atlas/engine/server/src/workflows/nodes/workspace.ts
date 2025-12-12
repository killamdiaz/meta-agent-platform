import type { WorkflowNodeDefinition } from '../types.js';

// Summarizes workspace activity for downstream agents.
const node: WorkflowNodeDefinition = {
  id: 'atlas.workspace.summarize',
  description: 'Generate a lightweight summary of workspace activity or documents.',
  inputs: {
    query: 'string',
    limit: 'number',
  },
  outputs: {
    summary: 'string',
    items: 'record[]',
  },
  executor: async ({ inputs, logger }) => {
    logger('Summarizing workspace data', { query: inputs.query });
    const summary = `Summary for query "${inputs.query ?? 'n/a'}"`;
    return {
      outputs: {
        summary,
        items: [],
      },
      status: 'success',
    };
  },
};

export default node;
