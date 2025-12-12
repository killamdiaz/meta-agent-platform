-- Jira embeddings table for semantic search
CREATE TABLE IF NOT EXISTS jira_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    ticket_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    comments JSONB,
    resolution TEXT,
    status TEXT,
    assignee TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    embedding VECTOR(1536) NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- Semantic search index
CREATE INDEX IF NOT EXISTS idx_jira_embeddings_embedding
    ON jira_embeddings USING hnsw (embedding vector_l2_ops);

-- Filter by org
CREATE INDEX IF NOT EXISTS idx_jira_embeddings_org
    ON jira_embeddings (org_id);
