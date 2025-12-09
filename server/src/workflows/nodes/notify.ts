import type { WorkflowNodeDefinition } from '../types.js';

// Sends notifications through the Atlas notify pipeline (simulated on execution engine).
const node: WorkflowNodeDefinition = {
  id: 'atlas.notify.send',
  description: 'Broadcast a notification message to the configured channel.',
  inputs: {
    message: 'string',
    channel: 'string',
    severity: 'string',
  },
  outputs: {
    notificationId: 'string',
    delivered: 'boolean',
  },
  executor: async ({ inputs, logger }) => {
    const notificationId = `notify_${Date.now()}`;
    logger('Dispatching notification', { notificationId, channel: inputs.channel });
    return {
      outputs: {
        notificationId,
        delivered: true,
      },
      status: 'success',
    };
  },
};

export default node;
