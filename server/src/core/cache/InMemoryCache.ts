interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
}

export class InMemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly defaultTtlMs: number, private readonly maxEntries = 200) {}

  private cleanupExpired(now = Date.now()) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  private enforceLimit() {
    if (this.store.size <= this.maxEntries) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestInsertedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.store.entries()) {
      if (entry.insertedAt < oldestInsertedAt) {
        oldestInsertedAt = entry.insertedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  set(key: string, value: T, ttlMs?: number) {
    const ttl = Math.max(0, ttlMs ?? this.defaultTtlMs);
    if (ttl === 0) {
      this.store.delete(key);
      return;
    }

    const now = Date.now();
    this.cleanupExpired(now);
    this.store.set(key, { value, expiresAt: now + ttl, insertedAt: now });
    this.enforceLimit();
  }

  get(key: string): T | null {
    const now = Date.now();
    this.cleanupExpired(now);
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string) {
    this.store.delete(key);
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
