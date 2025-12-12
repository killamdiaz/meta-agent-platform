// Creates a task for Atlas agents and returns a synthetic tracking id.
const node = {
    id: 'atlas.task.create',
    description: 'Create a task for an Atlas agent with the provided prompt and metadata.',
    inputs: {
        agent: 'string',
        prompt: 'string',
        metadata: 'record',
    },
    outputs: {
        taskId: 'string',
        status: 'string',
    },
    executor: async ({ inputs, logger }) => {
        const taskId = `task_${Date.now()}`;
        logger('Queued agent task', { taskId, agent: inputs.agent });
        return {
            outputs: {
                taskId,
                status: 'queued',
            },
            status: 'success',
        };
    },
};
export default node;
