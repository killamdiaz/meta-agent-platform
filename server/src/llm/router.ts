import { performance } from 'node:perf_hooks';
import { streamLocalLLM } from './local-llm.js';
import { generateGPT, streamGPT, gptAvailable } from './gpt-reasoner.js';
import { runLocalManaged } from './LocalLLMManager.js';

interface RouteOptions {
  prompt: string;
  context?: string;
  intent?: string;
  stream?: boolean;
  onToken?: (token: string) => void;
}

const COMPLEX_KEYWORDS = ['plan', 'architect', 'analyze', 'analysis', 'strategy', 'strategize', 'build', 'create automation'];

const FORCE_LOCAL = normalizeFlag(process.env.FORCE_LOCAL);
const FORCE_GPT = normalizeFlag(process.env.FORCE_GPT);
const LOCAL_BACKOFF_MS = Number(process.env.LOCAL_LLM_BACKOFF_MS ?? 60000);

let localUnavailableUntil = 0;
let localFailureCount = 0;

export async function routeMessage(options: RouteOptions): Promise<string> {
  const { prompt, context = '', intent = '', stream = false, onToken } = options;
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('routeMessage requires a prompt string.');
  }

  const start = performance.now();
  const model = selectModel(prompt, intent);
  const approxTokens = estimateTokens(prompt, context);

  try {
    let text: string;
    if (model === 'local') {
      text = stream
        ? await streamLocalLLM({ prompt, context, intent, stream, onToken })
        : await runLocalManaged(buildLocalPrompt(prompt, context));
      localFailureCount = 0;
    } else {
      text = stream
        ? await streamGPT({ prompt, context, intent, stream, onToken })
        : await generateGPT({ prompt, context, intent, stream });
    }
    const duration = Math.round(performance.now() - start);
    console.log(`[router] model=${model} time=${duration}ms tokens≈${approxTokens}`);
    return text.trim();
  } catch (error) {
    if (model === 'local' && FORCE_LOCAL !== true && gptAvailable()) {
      const duration = Math.round(performance.now() - start);
      console.warn(`[router] local model failed (${duration}ms). Falling back to GPT.`, (error as Error).message);
      localFailureCount += 1;
      localUnavailableUntil = Date.now() + LOCAL_BACKOFF_MS;
      const text = stream
        ? await streamGPT({ prompt, context, intent, stream, onToken })
        : await generateGPT({ prompt, context, intent, stream });
      const fallbackDuration = Math.round(performance.now() - start);
      console.log(`[router] model=gpt time=${fallbackDuration}ms tokens≈${approxTokens}`);
      return text.trim();
    }
    if (model === 'local' && FORCE_GPT !== true && !gptAvailable()) {
      const duration = Math.round(performance.now() - start);
      console.warn(
        `[router] local model failed and GPT unavailable (${duration}ms). Returning original prompt.`,
        (error as Error).message,
      );
      if (stream && typeof onToken === 'function') {
        onToken(prompt);
      }
      return prompt.trim();
    }
    throw error;
  }
}

function selectModel(prompt: string, intent: string): 'local' | 'gpt' {
  if (FORCE_LOCAL === true) return 'local';
  if (FORCE_GPT === true) return 'gpt';

  const normalizedIntent = intent?.toLowerCase?.() ?? '';
  if (
    normalizedIntent.includes('agent_schema') ||
    normalizedIntent.includes('dynamic_agent') ||
    normalizedIntent.includes('meta-controller')
  ) {
    return 'gpt';
  }

  const combined = `${normalizedIntent} ${prompt ?? ''}`.toLowerCase();
  const now = Date.now();
  if (now < localUnavailableUntil) {
    return gptAvailable() ? 'gpt' : 'local';
  }

  if (prompt.length < 300 && !containsComplexKeyword(combined)) {
    return 'local';
  }
  return gptAvailable() ? 'gpt' : 'local';
}

function containsComplexKeyword(text: string): boolean {
  return COMPLEX_KEYWORDS.some((keyword) => text.includes(keyword));
}

function estimateTokens(prompt: string, context: string): number {
  const totalLength = (prompt?.length ?? 0) + (context?.length ?? 0);
  return Math.max(1, Math.round(totalLength / 4));
}

function normalizeFlag(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes';
}

function buildLocalPrompt(prompt: string, context: string): string {
  if (!context) {
    return prompt;
  }
  return `${context.trim()}\n\n${prompt.trim()}`;
}
