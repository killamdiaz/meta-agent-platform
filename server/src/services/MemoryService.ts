import type { PoolClient } from 'pg';
import { pool } from '../db.js';

function deterministicEmbedding(text: string): number[] {
  const dimensions = 768;
  const values = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const index = (code + i) % dimensions;
    values[index] += (code % 23) / 100;
  }
  const norm = Math.sqrt(values.reduce((acc, val) => acc + val * val, 0)) || 1;
  return values.map((val) => val / norm);
}

export class MemoryService {
  static async addMemory(agentId: string, content: string, metadata: Record<string, unknown> = {}) {
    const embedding = deterministicEmbedding(content);
    await pool.query(
      `INSERT INTO agent_memory(agent_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4)`,
      [agentId, content, MemoryService.toVector(embedding), metadata]
    );
  }

  static async listMemories(agentId: string, limit = 10) {
    const { rows } = await pool.query(
      `SELECT id, content, metadata, created_at, embedding::text AS embedding
         FROM agent_memory
        WHERE agent_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [agentId, limit]
    );
    return rows.map((row) => ({
      ...row,
      similarity: typeof row.similarity === 'number' ? row.similarity : Number(row.similarity ?? 0),
      embedding: MemoryService.fromVector(row.embedding)
    }));
  }

  static async search(agentId: string, query: string, limit = 5) {
    const embedding = deterministicEmbedding(query);
    const { rows } = await pool.query(
      `SELECT id, content, metadata, created_at, embedding::text AS embedding,
              1 - (embedding <=> $2::vector) AS similarity
         FROM agent_memory
        WHERE agent_id = $1
        ORDER BY embedding <-> $2::vector
        LIMIT $3`,
      [agentId, MemoryService.toVector(embedding), limit]
    );
    return rows.map((row) => ({
      ...row,
      embedding: MemoryService.fromVector(row.embedding)
    }));
  }

  static async listGraph(agentId?: string, limit = 200) {
    const params: unknown[] = [];
    let where = '';
    if (agentId) {
      params.push(agentId);
      where = `WHERE m.agent_id = $${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT m.id,
              m.agent_id,
              m.content,
              m.metadata,
              m.created_at,
              m.embedding::text AS embedding,
              a.name AS agent_name
         FROM agent_memory m
         JOIN agents a ON a.id = m.agent_id
         ${where}
         ORDER BY m.created_at DESC
         LIMIT $${params.length}`,
      params
    );
    return rows.map((row) => ({
      ...row,
      embedding: MemoryService.fromVector(row.embedding)
    }));
  }

  static async attachToTransaction(
    client: PoolClient,
    agentId: string,
    content: string,
    metadata: Record<string, unknown>
  ) {
    const embedding = deterministicEmbedding(content);
    await client.query(
      `INSERT INTO agent_memory(agent_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4)`,
      [agentId, content, MemoryService.toVector(embedding), metadata]
    );
  }

  private static toVector(values: number[]) {
    return `[${values.join(',')}]`;
  }

  private static fromVector(value: unknown): number[] {
    if (Array.isArray(value)) {
      return value.map((entry) => Number(entry));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim().replace(/^\[|\]$/g, '');
      if (!trimmed) {
        return [];
      }
      return trimmed
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((num) => Number.isFinite(num));
    }
    return [];
  }
}
