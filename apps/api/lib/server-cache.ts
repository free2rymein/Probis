type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const globalCache = globalThis as typeof globalThis & {
  __probisApiCache?: Map<string, CacheEntry<unknown>>;
};

const cache = globalCache.__probisApiCache ?? new Map<string, CacheEntry<unknown>>();
globalCache.__probisApiCache = cache;

export const API_CACHE_TTL_MS = 45_000;

export const cacheKey = (scope: string, value: unknown) => `${scope}:${JSON.stringify(value)}`;

export const getCached = <T>(key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
};

export const setCached = <T>(key: string, value: T, ttlMs = API_CACHE_TTL_MS) => {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
};
