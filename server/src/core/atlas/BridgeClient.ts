import crypto from 'node:crypto';

export type AtlasTokenProvider = () => Promise<string> | string;

export interface AtlasBridgeClientOptions {
  agentId: string;
  secret: string;
  token?: string;
  tokenProvider?: AtlasTokenProvider;
  baseUrl?: string;
  defaultCacheTtlMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
  maxCacheEntries?: number;
}

export interface AtlasBridgeRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  cacheTtlMs?: number | null;
  cacheKey?: string;
  skipCache?: boolean;
  tag?: string;
  logMessage?: string;
  requestId?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  path: string;
}

const DEFAULT_BASE_URL = 'https://lighdepncfhiecqllmod.supabase.co/functions/v1';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const globalStructuredClone = (globalThis as { structuredClone?: <T>(input: T) => T }).structuredClone;

const serialiseError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
};

const cloneValue = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (globalStructuredClone) {
    try {
      return globalStructuredClone(value);
    } catch {
      // fall back to JSON clone
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export class AtlasBridgeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'AtlasBridgeError';
  }
}

interface CacheDescriptor {
  key: string;
  path: string;
}

export class AtlasBridgeClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly cacheIndex = new Map<string, Set<string>>();
  private readonly baseUrl: string;
  private tokenProvider?: AtlasTokenProvider;
  private currentToken: string | null;
  private inflightTokenRefresh: Promise<string> | null = null;
  private readonly defaultCacheTtlMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxCacheEntries: number;

  constructor(options: AtlasBridgeClientOptions) {
    if (!options.agentId) {
      throw new Error('Atlas bridge client requires agentId.');
    }
    if (!options.secret) {
      throw new Error('Atlas bridge client requires secret for HMAC signing.');
    }
    this.baseUrl = this.normaliseBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.tokenProvider = options.tokenProvider;
    this.currentToken = options.token?.trim() ? options.token.trim() : null;
    this.defaultCacheTtlMs = Math.max(0, options.defaultCacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryDelayMs = Math.max(50, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    this.requestTimeoutMs = Math.max(100, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 200);
    this.agentId = options.agentId;
    this.secret = options.secret;
  }

  private agentId: string;
  private secret: string;

  private logAttempt(details: {
    attempt: number;
    status?: number;
    error?: unknown;
    endpoint: string;
    requestId?: string;
    latencyMs: number;
  }) {
    const { attempt, status, error, endpoint, requestId, latencyMs } = details;
    const base = {
      component: 'atlas-bridge-client',
      agentId: this.agentId,
      endpoint,
      attempt,
      latencyMs,
      requestId: requestId ?? null,
    };
    if (error) {
      console.error({ ...base, level: 'error', status: status ?? null, error: serialiseError(error) });
    } else {
      console.log({ ...base, level: 'info', status: status ?? null });
    }
  }

  private createTimeoutSignal(signal?: AbortSignal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error('AtlasBridgeClient request timed out'));
      }
    }, this.requestTimeoutMs);

    const abortListener = () => {
      if (!controller.signal.aborted) {
        controller.abort(signal?.reason ?? new Error('Upstream request aborted'));
      }
    };

    if (signal) {
      if (signal.aborted) {
        abortListener();
      } else {
        signal.addEventListener('abort', abortListener, { once: true });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', abortListener);
        }
      },
    };
  }

  setToken(token: string | null | undefined) {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    this.currentToken = trimmed.length > 0 ? trimmed : null;
  }

  setTokenProvider(provider?: AtlasTokenProvider) {
    this.tokenProvider = provider;
    if (!provider) {
      this.inflightTokenRefresh = null;
    }
  }

  clearCache(pathPrefix?: string) {
    if (!pathPrefix) {
      this.cache.clear();
      this.cacheIndex.clear();
      return;
    }

    const normalised = this.normalisePath(pathPrefix);
    for (const [path, keys] of this.cacheIndex.entries()) {
      if (!path.startsWith(normalised)) {
        continue;
      }
      for (const key of keys) {
        this.cache.delete(key);
      }
      this.cacheIndex.delete(path);
    }
  }

  private cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        this.removeCacheIndexEntry(entry.path, key);
      }
    }
  }

  private removeCacheIndexEntry(path: string, key: string) {
    const index = this.cacheIndex.get(path);
    if (!index) {
      return;
    }
    index.delete(key);
    if (index.size === 0) {
      this.cacheIndex.delete(path);
    }
  }

  private enforceCacheLimit() {
    if (this.cache.size <= this.maxCacheEntries) {
      return;
    }
    for (const [key, entry] of this.cache.entries()) {
      this.cache.delete(key);
      this.removeCacheIndexEntry(entry.path, key);
      if (this.cache.size <= this.maxCacheEntries) {
        break;
      }
    }
  }

  async request<T>(options: AtlasBridgeRequestOptions): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase() as AtlasBridgeRequestOptions['method'];
    const descriptor = this.buildCacheDescriptor(method, options);
    const cacheTtl = this.resolveCacheTtl(method, options, descriptor !== null);

    this.cleanupExpiredCache();

    if (options.logMessage) {
      console.log(options.logMessage);
    }

    if (cacheTtl > 0 && descriptor) {
      const cached = this.cache.get(descriptor.key);
      if (cached && cached.expiresAt > Date.now()) {
        return cloneValue(cached.value) as T;
      }
      if (cached) {
        this.cache.delete(descriptor.key);
        this.removeCacheIndexEntry(cached.path, descriptor.key);
      }
    }

    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.headers);
    const body = this.serialiseBody(method, options.body, headers);

    const endpoint = options.tag ?? options.path;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      let token: string;
      try {
        token = await this.getToken(attempt > 1 && attempt !== this.maxRetries);
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await this.backoff(attempt);
        continue;
      }

      headers.Authorization = `Bearer ${token}`;
      headers['X-Agent-Id'] = this.agentId;
      headers['X-Agent-Signature'] = generateSignature(this.agentId, token, this.secret);

      const attemptStarted = Date.now();
      try {
        const timeout = this.createTimeoutSignal(options.signal);
        let response: globalThis.Response;
        try {
          response = await fetch(url, {
            method,
            headers,
            body,
            signal: timeout.signal,
          });
        } finally {
          timeout.cleanup();
        }

        const raw = await response.text();
        let payload: unknown = undefined;
        if (raw) {
          try {
            payload = JSON.parse(raw) as unknown;
          } catch {
            payload = raw;
          }
        }

        if (response.ok) {
          const result = (payload === undefined ? undefined : payload) as T;
          if (cacheTtl > 0 && descriptor) {
            this.storeInCache(descriptor, result, cacheTtl);
          } else if (method !== 'GET' && descriptor) {
            this.clearCache(descriptor.path);
          } else if (method !== 'GET') {
            this.clearCache(options.path);
          }
          this.logAttempt({
            attempt,
            status: response.status,
            endpoint,
            requestId: options.requestId,
            latencyMs: Date.now() - attemptStarted,
          });
          return result;
        }

        if (response.status === 401) {
          this.invalidateToken();
          if (this.tokenProvider && attempt < this.maxRetries) {
            continue;
          }
        }

        if (response.status === 429 && attempt < this.maxRetries) {
          await this.backoff(attempt, response.headers.get('retry-after'));
          continue;
        }

        if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
          await this.backoff(attempt, response.headers.get('retry-after'));
          continue;
        }

        const latency = Date.now() - attemptStarted;

        const errorMessage =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as Record<string, unknown>).error ?? 'Atlas Bridge request failed.')
            : `Atlas Bridge request failed with status ${response.status}`;
        const error = new AtlasBridgeError(errorMessage, response.status, payload);
        this.logAttempt({
          attempt,
          status: response.status,
          endpoint,
          requestId: options.requestId,
          latencyMs: latency,
          error,
        });
        throw error;
      } catch (error) {
        if (error instanceof AtlasBridgeError) {
          throw error;
        }
        if (attempt >= this.maxRetries) {
          this.logAttempt({
            attempt,
            endpoint,
            requestId: options.requestId,
            latencyMs: Date.now() - attemptStarted,
            error,
          });
          throw error;
        }
        this.logAttempt({
          attempt,
          endpoint,
          requestId: options.requestId,
          latencyMs: Date.now() - attemptStarted,
          error,
        });
        await this.backoff(attempt);
      }
    }

    throw new Error('Atlas Bridge request exhausted retry attempts.');
  }

  private invalidateToken() {
    this.currentToken = null;
    this.inflightTokenRefresh = null;
  }

  private resolveCacheTtl(
    method: AtlasBridgeRequestOptions['method'],
    options: AtlasBridgeRequestOptions,
    cacheable: boolean,
  ): number {
    if (!cacheable || method !== 'GET') {
      return 0;
    }
    if (options.skipCache) {
      return 0;
    }
    if (options.cacheTtlMs === null) {
      return 0;
    }
    if (typeof options.cacheTtlMs === 'number') {
      return Math.max(0, options.cacheTtlMs);
    }
    return this.defaultCacheTtlMs;
  }

  private storeInCache(descriptor: CacheDescriptor, value: unknown, ttlMs: number) {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(descriptor.key, { value: cloneValue(value), expiresAt, path: descriptor.path });
    let index = this.cacheIndex.get(descriptor.path);
    if (!index) {
      index = new Set<string>();
      this.cacheIndex.set(descriptor.path, index);
    }
    index.add(descriptor.key);
    this.enforceCacheLimit();
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.currentToken) {
      return this.currentToken;
    }

    if (!this.tokenProvider) {
      if (this.currentToken) {
        return this.currentToken;
      }
      throw new Error('Atlas bridge token is not configured.');
    }

    if (this.inflightTokenRefresh) {
      return this.inflightTokenRefresh;
    }

    const refreshPromise = Promise.resolve(this.tokenProvider())
      .then((value) => {
        const token = typeof value === 'string' ? value.trim() : '';
        if (!token) {
          throw new Error('Atlas bridge token provider returned an empty token.');
        }
        this.currentToken = token;
        return token;
      })
      .finally(() => {
        this.inflightTokenRefresh = null;
      });

    this.inflightTokenRefresh = refreshPromise;
    return refreshPromise;
  }

  private normaliseBaseUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      return DEFAULT_BASE_URL;
    }
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }

  private normalisePath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
      return '/';
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  private buildCacheDescriptor(
    method: AtlasBridgeRequestOptions['method'],
    options: AtlasBridgeRequestOptions,
  ): CacheDescriptor | null {
    if (method !== 'GET') {
      return null;
    }
    const normalisedPath = this.normalisePath(options.path);
    if (options.cacheKey) {
      return {
        key: `GET:${options.cacheKey}`,
        path: normalisedPath,
      };
    }
    const url = this.buildUrl(normalisedPath, options.query);
    return {
      key: `GET:${url}`,
      path: normalisedPath,
    };
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const normalisedPath = this.normalisePath(path);
    const url = new URL(`${this.baseUrl}${normalisedPath}`);
    if (query) {
      const entries = Object.entries(query).filter(
        ([, value]) => value !== undefined && value !== null,
      );
      if (entries.length > 0) {
        const params = new URLSearchParams();
        for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
          params.append(key, String(value));
        }
        params.sort();
        url.search = params.toString();
      }
    }
    return url.toString();
  }

  private buildHeaders(initial?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(initial ?? {}),
    };
    return headers;
  }

  private serialiseBody(
    method: AtlasBridgeRequestOptions['method'],
    body: unknown,
    headers: Record<string, string>,
  ): string | undefined {
    if (method === 'GET' || method === 'DELETE' || body === undefined) {
      return undefined;
    }
    if (typeof body === 'string') {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      return body;
    }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return JSON.stringify(body ?? {});
  }

  private async backoff(attempt: number, retryAfter?: string | null) {
    let delayMs = 0;
    if (retryAfter) {
      const parsedSeconds = Number(retryAfter);
      if (!Number.isNaN(parsedSeconds) && parsedSeconds >= 0) {
        delayMs = parsedSeconds * 1000;
      } else {
        const retryDate = new Date(retryAfter);
        const diff = retryDate.getTime() - Date.now();
        if (!Number.isNaN(diff) && diff > 0) {
          delayMs = diff;
        }
      }
    }
    if (delayMs <= 0) {
      const base = this.retryDelayMs * 2 ** Math.max(0, attempt - 1);
      delayMs = base + Math.random() * 100;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

export function generateSignature(agentId: string, token: string, secret: string): string {
  if (!agentId) throw new Error('agentId is required to generate signature.');
  if (!token) throw new Error('token is required to generate signature.');
  if (!secret) throw new Error('secret is required to generate signature.');
  return crypto.createHmac('sha256', secret).update(agentId + token).digest('hex');
}

export { DEFAULT_BASE_URL as ATLAS_BRIDGE_DEFAULT_BASE_URL };
