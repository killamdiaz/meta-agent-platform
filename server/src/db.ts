import pkg from 'pg';
const { Pool } = pkg;
import { config } from './config.js';
import crypto from 'crypto';

const connectionString = config.databaseUrl;

export const pool = new Pool({
  connectionString
});

async function waitForDb(retries = 10, delayMs = 3000) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      attempt += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[db] connection attempt ${attempt} failed (${message}). DSN=${connectionString}`);
      if (attempt >= retries) {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function initDb() {
  await waitForDb();
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      objectives JSONB DEFAULT '[]'::jsonb,
      memory_context TEXT DEFAULT '',
      tools JSONB DEFAULT '{}'::jsonb,
      internet_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      settings JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS internet_access_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_memory (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding VECTOR(768),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      memory_type TEXT NOT NULL DEFAULT 'long_term',
      expires_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sent_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      response JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS controller_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      related_agent UUID REFERENCES agents(id) ON DELETE SET NULL,
      related_task UUID REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      agent_type TEXT NOT NULL,
      summary TEXT,
      schema JSONB NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(agent_id)
    );

    CREATE TABLE IF NOT EXISTS automations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      automation_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS controller_approvals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolution_notes TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversation_edges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      source_agent UUID REFERENCES agents(id) ON DELETE SET NULL,
      target_agent UUID REFERENCES agents(id) ON DELETE SET NULL,
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_registry (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      schema JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE agent_memory
      ADD COLUMN IF NOT EXISTS memory_type TEXT NOT NULL DEFAULT 'long_term';
    ALTER TABLE agent_memory
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS forge_jira_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID NOT NULL,
      account_id UUID,
      jira_domain TEXT,
      cloud_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      scopes TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(org_id, account_id)
    );
    ALTER TABLE forge_jira_tokens DROP CONSTRAINT IF EXISTS forge_jira_tokens_org_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_forge_jira_tokens_org_account ON forge_jira_tokens(org_id, account_id);
    CREATE INDEX IF NOT EXISTS idx_forge_jira_tokens_org ON forge_jira_tokens(org_id);

    CREATE TABLE IF NOT EXISTS forge_integrations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID NOT NULL,
      account_id UUID,
      connector_type TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'inactive',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(org_id, connector_type)
    );

    CREATE TABLE IF NOT EXISTS forge_embeddings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID NOT NULL,
      account_id UUID,
      source_type TEXT NOT NULL,
      source_id TEXT,
      content TEXT NOT NULL,
      embedding VECTOR(3072),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      visibility_scope TEXT DEFAULT 'org',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id ON agent_memory(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_memory_type ON agent_memory(memory_type);
    CREATE INDEX IF NOT EXISTS idx_agent_memory_expires_at ON agent_memory(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_sent_messages_status ON sent_messages(status);
    CREATE INDEX IF NOT EXISTS idx_controller_approvals_status ON controller_approvals(status);
    CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_id ON agent_configs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_forge_embeddings_org_source ON forge_embeddings(org_id, source_type);
    -- Skip ANN index creation: pgvector caps HNSW/IVFFlat at 2000 dims and 3-large outputs 3072.

    CREATE TABLE IF NOT EXISTS forge_token_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID,
      account_id UUID,
      user_id UUID,
      source TEXT,
      agent_name TEXT,
      model_name TEXT,
      model_provider TEXT,
      input_tokens INT,
      output_tokens INT,
      total_tokens INT,
      cost_usd NUMERIC(12,6),
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_forge_token_usage_org ON forge_token_usage(org_id);
    CREATE INDEX IF NOT EXISTS idx_forge_token_usage_account ON forge_token_usage(account_id);
    CREATE INDEX IF NOT EXISTS idx_forge_token_usage_created ON forge_token_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_forge_token_usage_provider ON forge_token_usage(model_provider);

    CREATE TABLE IF NOT EXISTS billing_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      source TEXT NOT NULL DEFAULT 'slack',
      team_id TEXT,
      user_id TEXT,
      channel_id TEXT,
      event_type TEXT,
      tokens_prompt INT NOT NULL DEFAULT 0,
      tokens_completion INT NOT NULL DEFAULT 0,
      tokens_total INT NOT NULL DEFAULT 0,
      images_generated INT NOT NULL DEFAULT 0,
      actions_triggered JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_usage_source ON billing_usage(source);
    CREATE INDEX IF NOT EXISTS idx_billing_usage_team ON billing_usage(team_id);
    CREATE INDEX IF NOT EXISTS idx_billing_usage_created ON billing_usage(created_at);

    CREATE TABLE IF NOT EXISTS import_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID,
      account_id UUID,
      source TEXT,
      status TEXT DEFAULT 'queued',
      progress INT DEFAULT 0,
      error_count INT DEFAULT 0,
      total_records INT DEFAULT 0,
      processed_records INT DEFAULT 0,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON import_jobs(org_id);
    ALTER TABLE import_jobs
      ADD COLUMN IF NOT EXISTS error_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_records INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS processed_records INT DEFAULT 0;

    CREATE TABLE IF NOT EXISTS licenses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_name TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      max_seats INT NOT NULL,
      max_tokens BIGINT NOT NULL,
      license_key TEXT UNIQUE NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_active ON licenses(active);
    ALTER TABLE licenses
      ALTER COLUMN customer_id TYPE TEXT USING customer_id::text;

    -- minimal users table to support license linkage if not present
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT,
      license_id UUID REFERENCES licenses(id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES licenses(id);
  `);

  // if (process.env.NODE_ENV !== 'production') {
  //   const devCustomerId = process.env.DEFAULT_ORG_ID || 'dev-org';
  //   const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  //   const signature = crypto.createHmac('sha256', config.licenseSecret).update(`${devCustomerId}:${expires}`).digest('hex');
  //   const devKey = `${devCustomerId}:${expires}:${signature}`;
  //   await pool.query(
  //     `INSERT INTO licenses (customer_name, customer_id, issued_at, expires_at, max_seats, max_tokens, license_key, active)
  //      VALUES ($1, $2, NOW(), NOW() + interval '365 days', 1000, 1000000000, $3, TRUE)
  //      ON CONFLICT (license_key) DO NOTHING`,
  //     ['Development License', devCustomerId, devKey],
  //   );
  // }
}

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
