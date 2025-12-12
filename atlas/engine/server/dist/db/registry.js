import { pool } from '../db.js';
export async function saveAgentToDB(name, schema) {
    const description = schema.description ?? '';
    const { rows } = await pool.query(`
    INSERT INTO agent_registry (name, description, schema)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (name) DO UPDATE
      SET description = EXCLUDED.description,
          schema = EXCLUDED.schema
    RETURNING id, name, description, schema, created_at
    `, [name, description, JSON.stringify(schema)]);
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
export async function loadAgentFromDB(name) {
    const { rows } = await pool.query(`
    SELECT id, name, description, schema, created_at
      FROM agent_registry
     WHERE name = $1
     LIMIT 1
    `, [name]);
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
