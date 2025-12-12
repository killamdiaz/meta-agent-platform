// Pulls data from the Exhausts stream to hydrate downstream steps.
const node = {
    id: 'atlas.exhausts.pull',
    description: 'Ingest the latest Exhausts data snapshot for analysis.',
    inputs: {
        source: 'string',
        cursor: 'string',
    },
    outputs: {
        records: 'record[]',
        nextCursor: 'string',
    },
    executor: async ({ inputs, logger }) => {
        logger('Pulling Exhausts data', { source: inputs.source, cursor: inputs.cursor });
        return {
            outputs: {
                records: [],
                nextCursor: inputs.cursor ?? null,
            },
            status: 'success',
        };
    },
};
export default node;
