-- Exhausts table
CREATE TABLE IF NOT EXISTS exhausts (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('custom', 'zscaler_lss')),
  name TEXT NOT NULL,
  secret_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zscaler LSS logs
CREATE TABLE IF NOT EXISTS zscaler_lss_logs (
  id SERIAL PRIMARY KEY,
  exhaust_id UUID NOT NULL REFERENCES exhausts(id) ON DELETE CASCADE,
  raw_json JSONB NOT NULL,
  normalized_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embeddings
CREATE TABLE IF NOT EXISTS zscaler_lss_embeddings (
  id SERIAL PRIMARY KEY,
  exhaust_id UUID NOT NULL REFERENCES exhausts(id) ON DELETE CASCADE,
  log_id INTEGER NOT NULL REFERENCES zscaler_lss_logs(id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS zscaler_lss_vec_idx ON zscaler_lss_embeddings USING hnsw (embedding vector_cosine_ops);
