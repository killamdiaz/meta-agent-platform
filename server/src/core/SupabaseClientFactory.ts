import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

type ClientMode = 'active' | 'fallback';

let client: SupabaseClient | null = null;
let mode: ClientMode = 'active';
let initialised = false;

const buildClient = () => {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.warn('[supabase] missing credentials, using fallback mode');
    mode = 'fallback';
    return null;
  }

  try {
    const created = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      global: {
        fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetch(input, { ...(init ?? {}), cache: 'no-store' }),
      },
    });

    created.auth.onAuthStateChange((event) => {
      console.log('[supabase]', event);
    });

    mode = 'active';
    return created;
  } catch (error) {
    console.error('[supabase] failed to initialise client, using fallback', error);
    mode = 'fallback';
    return null;
  }
};

const ensureClient = () => {
  if (!initialised) {
    client = buildClient();
    initialised = true;
  }
  return client;
};

const withTimeout = async <T>(promise: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Supabase request timed out'));
    }, config.supabaseRequestTimeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

async function executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.supabaseRetryCount; attempt += 1) {
    try {
      return await withTimeout(operation());
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof Error &&
        (error.message.includes('timeout') || error.message.includes('Failed to fetch'));
      if (!retryable || attempt === config.supabaseRetryCount) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Supabase request failed');
}

export interface SupabaseContextOptions {
  requestId?: string;
  endpoint?: string;
  agentId?: string;
}

export async function withSupabase<T>(
  operation: (client: SupabaseClient) => Promise<T>,
  fallbackValue: T,
  context: SupabaseContextOptions,
): Promise<T> {
  const activeClient = ensureClient();
  if (!activeClient || mode === 'fallback') {
    console.warn('[supabase] using fallback', context);
    return fallbackValue;
  }

  try {
    const result = await executeWithRetry(() => operation(activeClient));
    return result;
  } catch (error) {
    mode = 'fallback';
    console.error('[supabase] failed, using fallback', {
      ...context,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
    return fallbackValue;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return ensureClient();
}

export function isSupabaseFallback(): boolean {
  ensureClient();
  return mode === 'fallback';
}
