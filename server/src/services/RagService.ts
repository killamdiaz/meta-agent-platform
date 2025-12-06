import { pool } from '../db.js';
import { embedContent } from '../core/ingestion/index.js';
import { chatCompletion } from './ModelRouterWrapper.js';

export interface RagAnswerOptions {
  orgId: string;
  accountId?: string;
  question: string;
  sources?: string[];
  threadId?: string;
  limit?: number;
}

export interface RagCitation {
  id: string;
  source_type: string;
  source_id: string | null;
  metadata: Record<string, unknown>;
  content: string;
  similarity: number;
  chunk_index?: number | null;
  normalized_url?: string | null;
  content_hash?: string | null;
}

export interface ParagraphCitation {
  paragraph_index: number;
  sources: Array<{
    source_id: string | null;
    chunk_index: number | null;
  }>;
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
  paragraph_citations?: ParagraphCitation[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function toPgVector(values: number[]) {
  return `[${values.join(',')}]`;
}

function truncate(text: string, max = 800) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function decomposeQuery(userQuery: string): Promise<string[]> {
  try {
    const completion = await chatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Decompose the user query into 2-6 atomic, non-overlapping sub-queries focused on single ZIA/ZPA/ZCC/networking concepts (GRE, tunnel mode, identity, location attribution, ZEN hop tracing, precedence). Output ONLY JSON: {"subqueries":["..."]}. Remove duplicates and meaningless items.',
        },
        { role: 'user', content: userQuery },
      ],
      temperature: 0,
      source: 'rag',
      agent_name: 'RagQueryDecomposer',
    });
    const raw = completion.content?.trim() || '';
    const jsonText = raw.startsWith('```') ? raw.replace(/```[a-zA-Z]*\n?/, '').replace(/```$/, '') : raw;
    const parsed = JSON.parse(jsonText);
    const subqueries: string[] = Array.isArray(parsed?.subqueries)
      ? parsed.subqueries.map((s: any) => String(s).trim()).filter(Boolean)
      : [];
    const unique = Array.from(new Set(subqueries));
    if (unique.length >= 1) {
      return unique.slice(0, 6);
    }
  } catch (err) {
    console.warn('[rag] decompose failed, falling back to single query', err);
  }
  return [userQuery];
}

type RetrievedChunk = RagCitation;

interface SubqueryResult {
  subquery: string;
  chunks: RetrievedChunk[];
}

async function multiTopicRetrieve(
  orgId: string,
  subqueries: string[],
  sources: string[] | null,
  topK = 5,
): Promise<SubqueryResult[]> {
  const results: SubqueryResult[] = [];
  for (const subquery of subqueries) {
    const embedding = await embedContent(subquery);
    if (!embedding?.length) {
      results.push({ subquery, chunks: [] });
      continue;
    }
    const dedupe = new Set<string>();
    const { rows } = await pool.query<
      RetrievedChunk & { similarity: number }
    >(
      `
        SELECT id,
               source_type,
               source_id,
               content,
               metadata,
               normalized_url,
               chunk_index,
               content_hash,
               1 - (embedding <=> $2::vector) AS similarity
          FROM forge_embeddings
         WHERE org_id = $1
           AND ($3::text[] IS NULL OR source_type = ANY($3))
         ORDER BY embedding <-> $2::vector
         LIMIT $4
      `,
      [orgId, toPgVector(embedding), sources, topK],
    );

    const chunks: RetrievedChunk[] = [];
    for (const row of rows) {
      const key =
        row.content_hash ||
        `${row.normalized_url || ''}#${row.chunk_index ?? ''}` ||
        row.id;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      chunks.push({
        id: row.id,
        source_type: row.source_type,
        source_id: row.source_id,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        content: row.content,
        similarity: Number(row.similarity ?? 0),
        chunk_index: row.chunk_index,
        normalized_url: row.normalized_url,
        content_hash: row.content_hash,
      });
    }
    results.push({ subquery, chunks });
  }
  return results;
}

function buildContextForLLM(originalQuestion: string, subqueries: string[], retrieved: SubqueryResult[]) {
  const parts: string[] = [];
  parts.push(`Original question: ${originalQuestion}`);
  parts.push(`Sub-queries: ${subqueries.map((s, i) => `${i + 1}. ${s}`).join(' | ')}`);
  parts.push('Evidence grouped by sub-query:');
  retrieved.forEach((group, idx) => {
    parts.push(`\n[Subquery ${idx + 1}] ${group.subquery}`);
    if (!group.chunks.length) {
      parts.push('- No KB source available for this part.');
    } else {
      group.chunks.forEach((chunk, cIdx) => {
        const sourceTag = chunk.source_id ? `${chunk.source_id}` : chunk.id;
        const chunkId = `${sourceTag}#${chunk.chunk_index ?? 0}`;
        parts.push(`- ${chunkId}: ${truncate(chunk.content)}`);
      });
    }
  });
  parts.push(
    [
      'Instructions:',
      '- Compose a merged answer covering all sub-queries.',
      '- Use the provided chunks verbatim where relevant; avoid hallucinations.',
      '- Add inline citations after sentences or paragraphs using the form [source_id#chunk_index].',
      '- If no chunk covers a sub-query, explicitly note "(No KB source available for this part)" for that piece.',
      '- Return ONLY JSON with fields: {"answer":"<full answer with citations>","citations":[{"paragraph_index":0,"sources":[{"source_id":"...", "chunk_index":n}]}]}',
      '- Paragraphs are separated by blank lines in the answer. Use 0-based paragraph_index.',
      '- Keep citations grouped by paragraph; include only sources actually used in that paragraph.',
    ].join('\n'),
  );
  return parts.join('\n');
}

function parseStructuredJson(content: string): { answer: string; citations: ParagraphCitation[] } | null {
  const raw = content.trim();
  const cleaned = raw.startsWith('```') ? raw.replace(/```[a-zA-Z]*\n?/, '').replace(/```$/, '') : raw;
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.answer === 'string' && Array.isArray(parsed.citations)) {
      return {
        answer: parsed.answer,
        citations: parsed.citations
          .map((c: any) => ({
            paragraph_index: Number(c.paragraph_index),
            sources: Array.isArray(c.sources)
              ? c.sources.map((s: any) => ({
                  source_id: s?.source_id ?? null,
                  chunk_index: s?.chunk_index ?? null,
                }))
              : [],
          }))
          .filter((c: ParagraphCitation) => !Number.isNaN(c.paragraph_index)),
      };
    }
  } catch (err) {
    console.warn('[rag] failed to parse structured JSON', err);
  }
  return null;
}

export async function ragAnswer(options: RagAnswerOptions): Promise<RagAnswer> {
  const { orgId, question } = options;
  const sources = options.sources && options.sources.length > 0 ? options.sources : null;
  const limit = options.limit ?? 8;

  const subqueries = await decomposeQuery(question);

  // Multi-topic retrieve
  let retrieved = await multiTopicRetrieve(orgId, subqueries, sources, 5);
  const hasAny = retrieved.some((r) => r.chunks.length);

  // Fallback to single-query retrieve when decomposition fails to find anything.
  if (!hasAny) {
    const fallbackEmbedding = await embedContent(question);
    const { rows } = await pool.query<
      RagCitation & { similarity: number }
    >(
      `
        SELECT id, source_type, source_id, content, metadata, normalized_url, chunk_index, content_hash,
               1 - (embedding <=> $2::vector) AS similarity
          FROM forge_embeddings
         WHERE org_id = $1
           AND ($3::text[] IS NULL OR source_type = ANY($3))
         ORDER BY embedding <-> $2::vector
         LIMIT $4
      `,
      [orgId, toPgVector(fallbackEmbedding), sources, limit],
    );
    const fallbackChunks: SubqueryResult = {
      subquery: question,
      chunks: rows.map((row) => ({
        id: row.id,
        source_type: row.source_type,
        source_id: row.source_id,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        content: row.content,
        similarity: Number(row.similarity ?? 0),
        chunk_index: row.chunk_index,
        normalized_url: row.normalized_url,
        content_hash: row.content_hash,
      })),
    };
    retrieved = [fallbackChunks];
  }

  // Build prompt with grouped evidence
  const prompt = buildContextForLLM(question, subqueries, retrieved);

  const completion = await chatCompletion({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    org_id: options.orgId,
    account_id: options.accountId,
    source: 'rag',
    agent_name: 'RagService',
    metadata: { citations: retrieved.reduce((sum, r) => sum + r.chunks.length, 0) },
  });

  const structured = completion.content ? parseStructuredJson(completion.content) : null;
  const answer = structured?.answer || completion.content || 'No answer generated.';
  const paragraph_citations = structured?.citations || [];

  // Build flattened citations for backward compatibility (limit 8)
  const chunkMap = new Map<string, RagCitation>();
  retrieved.forEach((group) => {
    group.chunks.forEach((chunk) => {
      const key =
        chunk.content_hash ||
        `${chunk.normalized_url || ''}#${chunk.chunk_index ?? ''}` ||
        chunk.id;
      if (!chunkMap.has(key)) {
        chunkMap.set(key, chunk);
      }
    });
  });

  const uniqueCitations: RagCitation[] = Array.from(chunkMap.values());
  uniqueCitations.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  const citations = uniqueCitations.slice(0, limit);

  return {
    answer,
    citations,
    paragraph_citations,
    usage: {
      prompt_tokens: completion.usage.prompt_tokens,
      completion_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens,
    },
  };
}
