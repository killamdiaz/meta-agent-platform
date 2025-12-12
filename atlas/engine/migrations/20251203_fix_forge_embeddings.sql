-- Migration: Fix forge_embeddings vector storage
-- Idempotent: safe to run multiple times
DO $$
DECLARE
    col_type text;
    col_udt  text;
BEGIN
    -- Inspect current embedding column
    SELECT data_type, udt_name
      INTO col_type, col_udt
      FROM information_schema.columns
     WHERE table_name = 'forge_embeddings'
       AND column_name = 'embedding';

    -- If already vector, just ensure index and exit
    IF col_udt = 'vector' THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_forge_embeddings_embedding') THEN
            EXECUTE 'DROP INDEX idx_forge_embeddings_embedding';
        END IF;
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_forge_embeddings_embedding ON forge_embeddings USING hnsw (embedding vector_cosine_ops)';
        RETURN;
    END IF;

    -- Add temporary vector column if needed
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'forge_embeddings'
           AND column_name = 'embedding_vec'
    ) THEN
        EXECUTE 'ALTER TABLE forge_embeddings ADD COLUMN embedding_vec vector(1536)';
    END IF;

    -- Convert text embeddings to vector format
    -- Replace [] with {} then cast to vector
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'forge_embeddings'
           AND column_name = 'embedding'
    ) THEN
        EXECUTE $conv$
            UPDATE forge_embeddings
               SET embedding_vec = replace(replace(embedding::text, '[', '{'), ']', '}')::vector
             WHERE embedding_vec IS NULL
               AND embedding IS NOT NULL
        $conv$;
    END IF;

    -- Drop old embedding column if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'forge_embeddings'
           AND column_name = 'embedding'
    ) THEN
        EXECUTE 'ALTER TABLE forge_embeddings DROP COLUMN embedding';
    END IF;

    -- Rename temp column into place
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'forge_embeddings'
           AND column_name = 'embedding_vec'
    ) THEN
        EXECUTE 'ALTER TABLE forge_embeddings RENAME COLUMN embedding_vec TO embedding';
    END IF;

    -- Recreate the HNSW index on the new vector column
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_forge_embeddings_embedding') THEN
        EXECUTE 'DROP INDEX idx_forge_embeddings_embedding';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_forge_embeddings_embedding ON forge_embeddings USING hnsw (embedding vector_cosine_ops)';
END
$$;
