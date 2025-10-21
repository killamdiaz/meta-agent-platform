import { Buffer } from 'node:buffer';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
  size: number;
}

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; // 32 MB

const estimateSize = <T>(value: T): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'string') {
    return Buffer.byteLength(value, 'utf8');
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return 8;
  }
  if (typeof value === 'bigint') {
    return 16;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
};

export class InMemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private currentBytes = 0;
  private readonly maxBytes: number;

  constructor(
    private readonly defaultTtlMs: number,
    private readonly maxEntries = 200,
    maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.maxBytes = maxBytes > 0 ? maxBytes : Number.POSITIVE_INFINITY;
  }

  private cleanupExpired(now = Date.now()) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        this.currentBytes = Math.max(0, this.currentBytes - entry.size);
      }
    }
  }

  private enforceLimit() {
    if (this.store.size <= this.maxEntries && this.currentBytes <= this.maxBytes) {
      return;
    }

    while (this.store.size > this.maxEntries || this.currentBytes > this.maxBytes) {
      const next = this.store.entries().next();
      if (next.done) {
        break;
      }
      const [key, entry] = next.value;
      this.store.delete(key);
      this.currentBytes = Math.max(0, this.currentBytes - entry.size);
    }
  }

  set(key: string, value: T, ttlMs?: number) {
    const ttl = Math.max(0, ttlMs ?? this.defaultTtlMs);
    if (ttl === 0) {
      this.delete(key);
      return;
    }

    const size = estimateSize(value);
    if (this.maxBytes > 0 && size > this.maxBytes) {
      // value too large to cache safely; skip caching to protect heap.
      this.delete(key);
      return;
    }

    const now = Date.now();
    this.cleanupExpired(now);
    const existing = this.store.get(key);
    if (existing) {
      this.currentBytes = Math.max(0, this.currentBytes - existing.size);
    }
    this.store.set(key, { value, expiresAt: now + ttl, insertedAt: now, size });
    this.currentBytes += size;
    this.enforceLimit();
  }

  get(key: string): T | null {
    const now = Date.now();
    this.cleanupExpired(now);
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.delete(key);
      if (entry) {
        this.currentBytes = Math.max(0, this.currentBytes - entry.size);
      }
      return null;
    }
    return entry.value;
  }

  delete(key: string) {
    const entry = this.store.get(key);
    if (entry) {
      this.currentBytes = Math.max(0, this.currentBytes - entry.size);
      this.store.delete(key);
    }
  }

  async withCache(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const existing = this.get(key);
    if (existing !== null) {
      return existing;
    }
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}
