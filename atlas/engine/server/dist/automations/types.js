export function clonePipeline(pipeline) {
    if (!pipeline)
        return null;
    return {
        name: pipeline.name,
        nodes: pipeline.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            agent: node.agent,
            config: { ...node.config },
        })),
        edges: pipeline.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    };
}
