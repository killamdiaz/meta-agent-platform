interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly defaultTtlMs: number) {}

  set(key: string, value: T, ttlMs?: number) {
    const ttl = Math.max(0, ttlMs ?? this.defaultTtlMs);
    if (ttl === 0) {
      this.store.delete(key);
      return;
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
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
