export interface MemoryNode {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    similarity?: number;
}
export interface EmbeddingRequest {
    input: string | string[];
    model?: string;
}
//# sourceMappingURL=index.d.ts.map