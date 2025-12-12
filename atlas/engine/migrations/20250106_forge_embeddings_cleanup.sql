-- Drop old embedding indexes first
DROP INDEX IF EXISTS forge_embeddings_embedding_idx;
DROP INDEX IF EXISTS forge_embeddings_embedding_hnsw_idx;
DROP INDEX IF EXISTS forge_embeddings_hnsw_idx;
DROP INDEX IF EXISTS forge_embeddings_ivfflat_idx;
DROP INDEX IF EXISTS idx_forge_embeddings_embedding;

-- Add new columns if they do not exist
ALTER TABLE forge_embeddings ADD COLUMN IF NOT EXISTS normalized_url TEXT;
ALTER TABLE forge_embeddings ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE forge_embeddings ADD COLUMN IF NOT EXISTS chunk_index INT;

-- Remove rows with wrong dimensions before altering type
DELETE FROM forge_embeddings WHERE embedding IS NOT NULL AND vector_dims(embedding) <> 3072;

-- Enforce new vector dimension for text-embedding-3-large
ALTER TABLE forge_embeddings ALTER COLUMN embedding TYPE vector(3072) USING embedding;

-- Deduplicate by content_hash (keep lowest id)
WITH dupes AS (
  SELECT content_hash, MIN(id::text)::uuid AS keep_id, array_agg(id) AS all_ids
  FROM forge_embeddings
  WHERE content_hash IS NOT NULL
  GROUP BY content_hash
  HAVING COUNT(*) > 1
)
DELETE FROM forge_embeddings fe
USING dupes d
WHERE fe.content_hash = d.content_hash
  AND fe.id <> d.keep_id;

-- Deduplicate by normalized_url + chunk_index
WITH dupes AS (
  SELECT normalized_url, chunk_index, MIN(id::text)::uuid AS keep_id, array_agg(id) AS all_ids
  FROM forge_embeddings
  WHERE normalized_url IS NOT NULL AND chunk_index IS NOT NULL
  GROUP BY normalized_url, chunk_index
  HAVING COUNT(*) > 1
)
DELETE FROM forge_embeddings fe
USING dupes d
WHERE fe.normalized_url = d.normalized_url
  AND fe.chunk_index = d.chunk_index
  AND fe.id <> d.keep_id;

-- Add uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uniq_forge_embeddings_content_hash ON forge_embeddings(content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_forge_embeddings_normalized_chunk ON forge_embeddings(normalized_url, chunk_index);

-- Skip ANN index recreation: pgvector caps HNSW/IVFFlat at 2000 dims and 3-large outputs 3072 dims.
