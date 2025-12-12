import { pool } from '../../db.js';
import { config } from '../../config.js';
import { embedText } from '../../services/ModelRouterWrapper.js';
import { chunkText, deterministicEmbedding, normalizeContent, toPgVector } from '@atlas/memory-core';
const DEFAULT_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';
export async function embedContent(text) {
    const cleaned = normalizeContent(text);
    if (!cleaned)
        return [];
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
    }
    catch (error) {
        console.warn('[ingestion] embedding failed, falling back to deterministic embedding', error);
    }
    return deterministicEmbedding(cleaned);
}
export async function storeEmbeddings(records) {
    if (!records.length)
        return [];
    const client = await pool.connect();
    const inserted = [];
    try {
        await client.query('BEGIN');
        for (const record of records) {
            const orgId = record.orgId || record.org_id;
            const accountId = record.accountId ?? record.account_id ?? null;
            if (!orgId) {
                throw new Error('orgId is required to store embeddings');
            }
            const chunks = chunkText(record.content);
            if (!chunks.length) {
                console.warn('[storeEmbeddings] no chunks produced for source', record.sourceId || 'unknown');
                continue;
            }
            chunks.forEach((chunk, idx) => {
                console.log('[storeEmbeddings] preparing chunk', JSON.stringify({
                    org_id: orgId,
                    source_id: record.sourceId ?? null,
                    chunk_index: idx + 1,
                    chunk_length: chunk.length,
                    total_chunks: chunks.length,
                }));
            });
            for (const [idx, chunk] of chunks.entries()) {
                let embedding = [];
                try {
                    embedding = await embedContent(chunk);
                    console.log('[storeEmbeddings] embedding computed', JSON.stringify({
                        org_id: orgId,
                        source_id: record.sourceId ?? null,
                        chunk_index: idx + 1,
                        embedding_length: embedding.length,
                    }));
                }
                catch (err) {
                    console.error('[storeEmbeddings] embedding call failed', err);
                    continue;
                }
                if (!embedding.length) {
                    console.warn('[storeEmbeddings] empty embedding for chunk; skipping', { source: record.sourceId });
                    continue;
                }
                try {
                    const { rows } = await client.query(`INSERT INTO forge_embeddings (org_id, account_id, source_type, source_id, content, embedding, metadata, visibility_scope)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
             RETURNING id, org_id, source_id`, [
                        orgId,
                        accountId,
                        record.sourceType,
                        record.sourceId ?? null,
                        chunk,
                        toPgVector(embedding),
                        JSON.stringify(record.metadata ?? {}),
                        record.visibilityScope ?? 'org',
                    ]);
                    const row = rows[0];
                    inserted.push(row);
                    console.log('[storeEmbeddings] inserted', JSON.stringify({ id: row.id, org_id: row.org_id, source_id: row.source_id }));
                }
                catch (err) {
                    console.error('[storeEmbeddings] insert failed, rolling back chunk', err);
                    throw err;
                }
            }
        }
        await client.query('COMMIT');
        return inserted;
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('[storeEmbeddings] transaction rolled back', error);
        throw error;
    }
    finally {
        client.release();
    }
}
