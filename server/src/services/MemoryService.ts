import type { PoolClient } from 'pg';
import { pool } from '../db.js';

export interface MemoryRecord {
  id: string;
  agent_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type MemoryEvent =
  | {
      type: 'created';
      memory: MemoryRecord;
    };

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
  private static listeners = new Set<(event: MemoryEvent) => void>();

  static on(eventHandler: (event: MemoryEvent) => void) {
    this.listeners.add(eventHandler);
    return () => {
      this.listeners.delete(eventHandler);
    };
  }

  private static emit(event: MemoryEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[memory-service] listener error', error);
      }
    }
  }

  static async addMemory(agentId: string, content: string, metadata: Record<string, unknown> = {}) {
    const embedding = deterministicEmbedding(content);
    const enrichedMetadata = {
      createdBy: metadata?.createdBy ?? agentId,
      ...metadata
    };
    const { rows } = await pool.query<MemoryRecord>(
      `INSERT INTO agent_memory(agent_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, metadata, created_at`,
      [agentId, content, MemoryService.toVector(embedding), enrichedMetadata]
    );
    const memory = rows[0];
    if (memory) {
      MemoryService.emit({ type: 'created', memory });
    }
  }

  static async listMemories(_agentId: string, limit = 10) {
    const { rows } = await pool.query<MemoryRecord>(
      `SELECT id, agent_id, content, metadata, created_at
         FROM agent_memory
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  }

  static async search(query: string, limit = 5) {
    const embedding = deterministicEmbedding(query);
    const { rows } = await pool.query(
      `SELECT id, content, metadata, created_at,
              1 - (embedding <=> $2::vector) AS similarity
         FROM agent_memory
        ORDER BY embedding <-> $1::vector
        LIMIT $2`,
      [MemoryService.toVector(embedding), limit]
    );
    return rows;
  }

  static async attachToTransaction(
    client: PoolClient,
    agentId: string,
    content: string,
    metadata: Record<string, unknown>
  ) {
    const embedding = deterministicEmbedding(content);
    const enrichedMetadata = {
      createdBy: metadata?.createdBy ?? agentId,
      ...metadata
    };
    const { rows } = await client.query<MemoryRecord>(
      `INSERT INTO agent_memory(agent_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, content, metadata, created_at`,
      [agentId, content, MemoryService.toVector(embedding), enrichedMetadata]
    );
    const memory = rows[0];
    if (memory) {
      MemoryService.emit({ type: 'created', memory });
    }
  }

  private static toVector(values: number[]) {
    return `[${values.join(',')}]`;
  }
}
