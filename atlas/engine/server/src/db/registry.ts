import { pool } from '../db.js';
import type { AgentSchema, AgentRecord as AgentRegistryRecord } from '../types/agents.js';

interface AgentRegistryRow {
  id: string;
  name: string;
  description: string | null;
  schema: AgentSchema;
  created_at: string;
}

export async function saveAgentToDB(name: string, schema: AgentSchema): Promise<AgentRegistryRecord> {
  const description = schema.description ?? '';

  const { rows } = await pool.query<AgentRegistryRow>(
    `
    INSERT INTO agent_registry (name, description, schema)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description,
          schema = EXCLUDED.schema
    RETURNING id, name, description, schema, created_at
    `,
    [name, description, JSON.stringify(schema)],
  );

  const record = rows[0];
  if (!record) {
    throw new Error(`Failed to persist agent schema for ${name}`);
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? '',
    schema: record.schema,
    created_at: record.created_at,
  };
}

export async function loadAgentFromDB(name: string): Promise<AgentRegistryRecord | null> {
  const { rows } = await pool.query<AgentRegistryRow>(
    `
    SELECT id, name, description, schema, created_at
      FROM agent_registry
     WHERE name = $1
     LIMIT 1
    `,
    [name],
  );

  const record = rows[0];
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? '',
    schema: record.schema,
    created_at: record.created_at,
  };
}
