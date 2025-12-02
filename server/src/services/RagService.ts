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
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function toPgVector(values: number[]) {
  return `[${values.join(',')}]`;
}

export async function ragAnswer(options: RagAnswerOptions): Promise<RagAnswer> {
  const { orgId, question } = options;
  const embedding = await embedContent(question);
  const sources = options.sources && options.sources.length > 0 ? options.sources : null;
  const limit = options.limit ?? 8;

  const { rows } = await pool.query<
    RagCitation & {
      similarity: number;
    }
  >(
    `
      SELECT id, source_type, source_id, content, metadata, 1 - (embedding <=> $2::vector) AS similarity
        FROM forge_embeddings
       WHERE org_id = $1
         AND ($3::text[] IS NULL OR source_type = ANY($3))
       ORDER BY embedding <-> $2::vector
       LIMIT $4
    `,
    [orgId, toPgVector(embedding), sources ? sources : null, limit],
  );

  const citations: RagCitation[] = rows.map((row) => ({
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    content: row.content,
    similarity: Number(row.similarity ?? 0),
  }));

  const prompt = [
    'You are Atlas Forge RAG. Answer concisely based only on the provided context.',
    'Cite sources inline using [n].',
    '',
    'Context:',
    ...citations.map((citation, index) => `[${index + 1}] ${citation.content}`),
    '',
    `Question: ${question}`,
  ].join('\n');

  const completion = await chatCompletion({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    org_id: options.orgId,
    account_id: options.accountId,
    source: 'rag',
    agent_name: 'RagService',
    metadata: { citations: citations.length },
  });

  const answer = completion.content || 'No answer generated.';

  return {
    answer,
    citations,
    usage: {
      prompt_tokens: completion.usage.prompt_tokens,
      completion_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens,
    },
  };
}
