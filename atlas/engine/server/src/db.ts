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
    CREATE TABLE IF NOT EXISTS orgs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS org_domains (
      org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (org_id, domain)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_domains_domain ON org_domains(domain);

    CREATE TABLE IF NOT EXISTS saml_configs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      idp_metadata_url TEXT,
      idp_entity_id TEXT,
      idp_sso_url TEXT,
      idp_certificate TEXT,
      sp_entity_id TEXT,
      sp_acs_url TEXT,
      sp_metadata_url TEXT,
      enforce_sso BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(org_id)
    );

    CREATE TABLE IF NOT EXISTS saml_audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
      user_email TEXT,
      event_type TEXT NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_saml_audit_org ON saml_audit_logs(org_id);

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

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT,
      license_id UUID REFERENCES licenses(id),
      org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
      first_name TEXT,
      last_name TEXT,
      role TEXT DEFAULT 'member',
      auth_provider TEXT,
      attributes JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS license_id UUID REFERENCES licenses(id);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_users_email_org ON users(email, org_id);
    CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

    CREATE TABLE IF NOT EXISTS saml_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      name_id TEXT,
      session_index TEXT,
      relay_state TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_saml_sessions_org ON saml_sessions(org_id);
    CREATE INDEX IF NOT EXISTS idx_saml_sessions_user ON saml_sessions(user_id);

    CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      required_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
      missing_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(name)
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      event_payload JSONB DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      error TEXT,
      current_step TEXT,
      state JSONB DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);

    CREATE TABLE IF NOT EXISTS workflow_states (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_id TEXT,
      state JSONB DEFAULT '{}'::jsonb,
      logs JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_states_run ON workflow_states(workflow_run_id);

    CREATE TABLE IF NOT EXISTS atlas_connectors (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      publisher TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      download_count INT NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      manifest JSONB NOT NULL,
      actions JSONB NOT NULL DEFAULT '{}'::jsonb,
      triggers JSONB NOT NULL DEFAULT '{}'::jsonb,
      transforms JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, name, version)
    );
    CREATE INDEX IF NOT EXISTS idx_atlas_connectors_status ON atlas_connectors(status);
    CREATE INDEX IF NOT EXISTS idx_atlas_connectors_tenant ON atlas_connectors(tenant_id);

    CREATE TABLE IF NOT EXISTS atlas_connector_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connector_id UUID NOT NULL REFERENCES atlas_connectors(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      manifest JSONB NOT NULL,
      actions JSONB NOT NULL,
      triggers JSONB NOT NULL,
      transforms JSONB NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(connector_id, version)
    );

    CREATE TABLE IF NOT EXISTS atlas_connector_secrets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id TEXT NOT NULL,
      connector_id UUID NOT NULL REFERENCES atlas_connectors(id) ON DELETE CASCADE,
      secret_key TEXT NOT NULL,
      iv BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      salt BYTEA NOT NULL,
      encrypted_value BYTEA NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, connector_id, secret_key)
    );
    CREATE INDEX IF NOT EXISTS idx_atlas_secrets_connector ON atlas_connector_secrets(connector_id);
    CREATE INDEX IF NOT EXISTS idx_atlas_secrets_tenant ON atlas_connector_secrets(tenant_id);

    CREATE TABLE IF NOT EXISTS branding (
      id UUID PRIMARY KEY,
      company_name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      logo_data TEXT,
      sidebar_logo_data TEXT,
      favicon_data TEXT,
      login_logo_data TEXT,
      show_sidebar_text BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO branding (id, company_name, short_name, show_sidebar_text)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Atlas', 'Atlas', TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);

  if (config.defaultOrgId) {
    await pool.query(
      `INSERT INTO orgs (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [config.defaultOrgId, 'Default Org'],
    );
  }

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
