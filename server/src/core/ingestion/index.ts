import { pool } from '../../db.js';
import { config } from '../../config.js';
import { embedText } from '../../services/ModelRouterWrapper.js';

export type VisibilityScope = 'org' | 'account' | 'private';

export interface IngestionRecord {
  orgId: string;
  accountId?: string;
  sourceType: string;
  sourceId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  visibilityScope?: VisibilityScope;
}

const DEFAULT_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function normalizeContent(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}

function toPgVector(values: number[]) {
  return `[${values.join(',')}]`;
}

export function chunkText(text: string, size = 1200, overlap = 200) {
  const normalized = normalizeContent(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += size - overlap) {
    chunks.push(normalized.slice(i, i + size));
    if (i + size >= normalized.length) {
      break;
    }
  }
  return chunks;
}

async function deterministicEmbedding(text: string): Promise<number[]> {
  const dimensions = 1536;
  const values = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const index = (code + i) % dimensions;
    values[index] += (code % 23) / 100;
  }
  const norm = Math.sqrt(values.reduce((acc, val) => acc + val * val, 0)) || 1;
  return values.map((val) => val / norm);
}

export async function embedContent(text: string): Promise<number[]> {
  const cleaned = normalizeContent(text);
  if (!cleaned) return [];

  try {
    const response = await embedText({
      model: DEFAULT_MODEL,
      input: cleaned,
      source: 'ingestion',
      agent_name: 'IngestionEmbedding',
      org_id: config.defaultOrgId || undefined,
      account_id: config.defaultAccountId || undefined,
    });
    if (response.embeddings[0]) {
      return response.embeddings[0];
    }
  } catch (error) {
    console.warn('[ingestion] embedding failed, falling back to deterministic embedding', error);
  }
  return deterministicEmbedding(cleaned);
}

export async function storeEmbeddings(records: IngestionRecord[]) {
  if (!records.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const record of records) {
      const chunks = chunkText(record.content);
      for (const chunk of chunks) {
        const embedding = await embedContent(chunk);
        if (!embedding.length) {
          continue;
        }
        await client.query(
          `INSERT INTO forge_embeddings (org_id, account_id, source_type, source_id, content, embedding, metadata, visibility_scope)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            record.orgId,
            record.accountId ?? null,
            record.sourceType,
            record.sourceId ?? null,
            chunk,
            toPgVector(embedding),
            record.metadata ?? {},
            record.visibilityScope ?? 'org',
          ],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
