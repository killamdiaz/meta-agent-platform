import OpenAI from 'openai';
import fetch from 'node-fetch';
import { pool } from '../db.js';
import { config } from '../config.js';
import { estimateCostUsd } from '../utils/costCalculator.js';

type Provider = 'openai' | 'local';

export interface ModelRequestContext {
  org_id?: string | null;
  account_id?: string | null;
  user_id?: string | null;
  source?: string;
  agent_name?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatCompletionParams extends ModelRequestContext {
  model: string;
  messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>;
  temperature?: number;
}

export interface EmbeddingParams extends ModelRequestContext {
  model: string;
  input: string | string[];
}

export interface ChatCompletionResult {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  raw: unknown;
}

const openaiClient = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

function detectProvider(model: string): Provider {
  if (model.startsWith('local-') || model.includes('llama') || model.includes('mistral') || model.includes('mixtral')) {
    return 'local';
  }
  return 'openai';
}

function approximateTokenCount(text: string) {
  // Rough heuristic: average 4 chars per token.
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return Math.max(1, Math.ceil(cleaned.length / 4));
}

async function logUsage({
  org_id,
  account_id,
  user_id,
  source,
  agent_name,
  model,
  provider,
  promptTokens,
  completionTokens,
  metadata,
}: {
  org_id?: string | null;
  account_id?: string | null;
  user_id?: string | null;
  source?: string;
  agent_name?: string;
  model: string;
  provider: Provider;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, unknown>;
}) {
  const total = promptTokens + completionTokens;
  const cost = estimateCostUsd(model, provider, promptTokens, completionTokens);
  await pool.query(
    `INSERT INTO forge_token_usage
       (org_id, account_id, user_id, source, agent_name, model_name, model_provider, input_tokens, output_tokens, total_tokens, cost_usd, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      org_id ?? null,
      account_id ?? null,
      user_id ?? null,
      source ?? null,
      agent_name ?? null,
      model,
      provider,
      promptTokens,
      completionTokens,
      total,
      cost,
      metadata ?? {},
    ],
  );
  return { total, cost_usd: cost };
}

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const provider = detectProvider(params.model);
  let promptTokens = 0;
  let completionTokens = 0;
  let content = '';
  let raw: unknown;

  if (provider === 'openai') {
    if (!openaiClient) throw new Error('OpenAI API key missing');
    const response = await openaiClient.chat.completions.create({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.2,
    });
    raw = response;
    content = response.choices?.[0]?.message?.content ?? '';
    promptTokens = response.usage?.prompt_tokens ?? approximateTokenCount(JSON.stringify(params.messages));
    completionTokens = response.usage?.completion_tokens ?? approximateTokenCount(content);
  } else {
    if (!config.modelRouterUrl) {
      throw new Error('MODEL_ROUTER_URL not configured for local models');
    }
    const routerResponse = await fetch(`${config.modelRouterUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
      }),
    });
    const data: any = await routerResponse.json();
    raw = data;
    content = data?.choices?.[0]?.message?.content ?? '';
    const usage = data?.usage;
    promptTokens =
      typeof usage?.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : approximateTokenCount(JSON.stringify(params.messages));
    completionTokens =
      typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : approximateTokenCount(content);
  }

  const { cost_usd } = await logUsage({
    org_id: params.org_id,
    account_id: params.account_id,
    user_id: params.user_id,
    source: params.source,
    agent_name: params.agent_name,
    model: params.model,
    provider,
    promptTokens,
    completionTokens,
    metadata: params.metadata,
  });

  return {
    content,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cost_usd,
    },
    raw,
  };
}

export async function embedText(params: EmbeddingParams): Promise<{ embeddings: number[][] }> {
  const provider = detectProvider(params.model);
  let embeddings: number[][] = [];
  if (provider === 'openai') {
    if (!openaiClient) throw new Error('OpenAI API key missing');
    const response = await openaiClient.embeddings.create({
      model: params.model,
      input: params.input,
    });
    embeddings = response.data.map((item) => item.embedding as number[]);
    const totalTokens = Array.isArray(params.input)
      ? params.input.reduce((sum, text) => sum + approximateTokenCount(String(text)), 0)
      : approximateTokenCount(String(params.input));
    await logUsage({
      org_id: params.org_id,
      account_id: params.account_id,
      user_id: params.user_id,
      source: params.source,
      agent_name: params.agent_name,
      model: params.model,
      provider,
      promptTokens: totalTokens,
      completionTokens: 0,
      metadata: params.metadata,
    });
  } else {
    throw new Error('Embedding for local models not implemented');
  }
  return { embeddings };
}
