import { unwrapEnvelope } from './seed-envelope';

const REDIS_OP_TIMEOUT_MS = 1_500;
const REDIS_PIPELINE_TIMEOUT_MS = 5_000;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type CacheBackend = 'sidecar' | 'local-file' | 'upstash' | 'none';

function getCacheBackend(): CacheBackend {
  if (process.env.LOCAL_API_MODE === 'tauri-sidecar') return 'sidecar';
  
  // Vercel Edge Functions don't support Node.js fs/path modules
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) return 'upstash';
    return 'none';
  }

  const configuredBackend = (process.env.WM_CACHE_BACKEND || '').trim().toLowerCase();
  if (configuredBackend === 'local-file') return 'local-file';

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return 'upstash';

  return 'none';
}

/**
 * Environment-based key prefix to avoid collisions when multiple deployments
 * share the same Upstash Redis instance (M-6 fix).
 */
function getKeyPrefix(): string {
  const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development'
  if (!env || env === 'production' || env === 'development') return '';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';
  return `${env}:${sha}:`;
}

let cachedPrefix: string | undefined;
function prefixKey(key: string): string {
  if (cachedPrefix === undefined) cachedPrefix = getKeyPrefix();
  if (!cachedPrefix) return key;
  return `${cachedPrefix}${key}`;
}

export type CacheReadResult = { status: 'hit'; value: unknown } | { status: 'miss' } | { status: 'error'; error: unknown };

/**
 * Cache read that keeps "miss" and "error" distinguishable, unlike
 * `getCachedJson` which collapses both to `null`. Resilience scoring needs
 * this: a read failure that looks like an empty key is exactly how a dead
 * upstream source stays invisible in coverage/freshness accounting.
 *
 * Note: this fork's `getCachedJson` already catches its own fetch/parse
 * errors and logs+returns null (see below), so in practice this wrapper's
 * 'error' branch only fires if `getCachedJson` itself throws synchronously.
 * Kept as a distinct status anyway so callers ported from upstream don't
 * need their branching logic rewritten.
 */
export async function readCachedJson(key: string, raw = false): Promise<CacheReadResult> {
  try {
    const value = await getCachedJson(key, raw);
    return value == null ? { status: 'miss' } : { status: 'hit', value };
  } catch (err) {
    return { status: 'error', error: err };
  }
}

export async function getCachedJson(key: string, raw = false): Promise<unknown | null> {
  const backend = getCacheBackend();

  if (backend === 'sidecar') {
    const { sidecarCacheGet } = await import('./sidecar-cache');
    return sidecarCacheGet(key);
  }

  const finalKey = raw ? key : prefixKey(key);
  if (backend === 'local-file') {
    const { localCacheGet } = await import('./local-cache-store');
    try {
      const rawValue = await localCacheGet(finalKey);
      // Envelope-aware: unwrap contract-mode canonical keys; legacy values pass through.
      return rawValue ? unwrapEnvelope(JSON.parse(rawValue)).data : null;
    } catch (err) {
      console.warn('[redis] local getCachedJson failed:', errMsg(err));
      return null;
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(finalKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: string };
    // Envelope-aware by default — RPC consumers get the bare payload regardless
    // of whether the writer has migrated to contract mode. Legacy shapes pass
    // through unchanged (unwrapEnvelope returns {_seed: null, data: raw}).
    return data.result ? unwrapEnvelope(JSON.parse(data.result)).data : null;
  } catch (err) {
    console.warn('[redis] getCachedJson failed:', errMsg(err));
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const backend = getCacheBackend();

  if (backend === 'sidecar') {
    const { sidecarCacheSet } = await import('./sidecar-cache');
    sidecarCacheSet(key, value, ttlSeconds);
    return;
  }

  const finalKey = prefixKey(key);
  if (backend === 'local-file') {
    const { localCacheSet } = await import('./local-cache-store');
    try {
      await localCacheSet(finalKey, JSON.stringify(value), ttlSeconds);
    } catch (err) {
      console.warn('[redis] local setCachedJson failed:', errMsg(err));
    }
    return;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    // Atomic SET with EX — single call avoids race between SET and EXPIRE (C-3 fix)
    await fetch(`${url}/set/${encodeURIComponent(finalKey)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REDIS_OP_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[redis] setCachedJson failed:', errMsg(err));
  }
}

const NEG_SENTINEL = '__WM_NEG__';

/**
 * Batch GET using Upstash pipeline API — single HTTP round-trip for N keys.
 * Returns a Map of key → parsed JSON value (missing/failed/sentinel keys omitted).
 */
export async function getCachedJsonBatch(keys: string[], raw = false): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();
  if (keys.length === 0) return result;

  const backend = getCacheBackend();
  if (backend === 'local-file') {
    const { localCacheGetBatch } = await import('./local-cache-store');
    try {
      const finalKeys = keys.map((key) => raw ? key : prefixKey(key));
      const rawMap = await localCacheGetBatch(finalKeys);
      for (let i = 0; i < keys.length; i++) {
        const value = rawMap.get(finalKeys[i]!);
        if (!value) continue;
        try {
          const parsed = JSON.parse(value);
          if (parsed !== NEG_SENTINEL) result.set(keys[i]!, unwrapEnvelope(parsed).data);
        } catch {
          // skip malformed local entries
        }
      }
    } catch (err) {
      console.warn('[redis] local getCachedJsonBatch failed:', errMsg(err));
    }
    return result;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return result;

  try {
    const pipeline = keys.map((k) => ['GET', raw ? k : prefixKey(k)]);
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) return result;

    const data = (await resp.json()) as Array<{ result?: string }>;
    for (let i = 0; i < keys.length; i++) {
      const raw = data[i]?.result;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Envelope-aware: unwrap contract-mode canonical keys; legacy values pass through.
          if (parsed !== NEG_SENTINEL) result.set(keys[i]!, unwrapEnvelope(parsed).data);
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.warn('[redis] getCachedJsonBatch failed:', errMsg(err));
  }
  return result;
}

/**
 * In-flight request coalescing map.
 * When multiple concurrent requests hit the same cache key during a miss,
 * only the first triggers the upstream fetch — others await the same promise.
 * This eliminates duplicate upstream API calls within a single Edge Function invocation.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Check cache, then fetch with coalescing on miss.
 * Concurrent callers for the same key share a single upstream fetch + Redis write.
 * When fetcher returns null, a sentinel is cached for negativeTtlSeconds to prevent request storms.
 */
export async function cachedFetchJson<T extends object>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
  negativeTtlSeconds = 120,
): Promise<T | null> {
  const cached = await getCachedJson(key);
  if (cached === NEG_SENTINEL) return null;
  if (cached !== null) return cached as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      } else {
        await setCachedJson(key, NEG_SENTINEL, negativeTtlSeconds);
      }
      return result;
    })
    .catch((err: unknown) => {
      console.warn(`[redis] cachedFetchJson fetcher failed for "${key}":`, errMsg(err));
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Like cachedFetchJson but reports the data source.
 * Use when callers need to distinguish cache hits from fresh fetches
 * (e.g. to set provider/cached metadata on responses).
 *
 * Returns { data, source } where source is:
 *   'cache'  — served from Redis
 *   'fresh'  — fetcher ran (leader) or joined an in-flight fetch (follower)
 */
export async function cachedFetchJsonWithMeta<T extends object>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
  negativeTtlSeconds = 120,
): Promise<{ data: T | null; source: 'cache' | 'fresh' }> {
  const cached = await getCachedJson(key);
  if (cached === NEG_SENTINEL) return { data: null, source: 'cache' };
  if (cached !== null) return { data: cached as T, source: 'cache' };

  const existing = inflight.get(key);
  if (existing) {
    const data = (await existing) as T | null;
    return { data, source: 'fresh' };
  }

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      } else {
        await setCachedJson(key, NEG_SENTINEL, negativeTtlSeconds);
      }
      return result;
    })
    .catch((err: unknown) => {
      console.warn(`[redis] cachedFetchJsonWithMeta fetcher failed for "${key}":`, errMsg(err));
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const data = await promise;
  return { data, source: 'fresh' };
}

export async function geoSearchByBox(
  key: string, lon: number, lat: number,
  widthKm: number, heightKm: number, count: number, raw = false,
): Promise<string[]> {
  const backend = getCacheBackend();
  const finalKey = raw ? key : prefixKey(key);
  if (backend === 'local-file') {
    const { localCacheGeoSearchByBox } = await import('./local-cache-store');
    try {
      return await localCacheGeoSearchByBox(finalKey, lon, lat, widthKm, heightKm, count);
    } catch (err) {
      console.warn('[redis] local geoSearchByBox failed:', errMsg(err));
      return [];
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];
  try {
    const pipeline = [
      ['GEOSEARCH', finalKey, 'FROMLONLAT', String(lon), String(lat),
       'BYBOX', String(widthKm), String(heightKm), 'km', 'ASC', 'COUNT', String(count)],
    ];
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as Array<{ result?: string[] }>;
    return data[0]?.result ?? [];
  } catch (err) {
    console.warn('[redis] geoSearchByBox failed:', errMsg(err));
    return [];
  }
}

export async function getHashFieldsBatch(
  key: string, fields: string[], raw = false,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (fields.length === 0) return result;

  const backend = getCacheBackend();
  const finalKey = raw ? key : prefixKey(key);
  if (backend === 'local-file') {
    const { localCacheHashGetBatch } = await import('./local-cache-store');
    try {
      return await localCacheHashGetBatch(finalKey, fields);
    } catch (err) {
      console.warn('[redis] local getHashFieldsBatch failed:', errMsg(err));
      return result;
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return result;
  try {
    const pipeline = [['HMGET', finalKey, ...fields]];
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) return result;
    const data = (await resp.json()) as Array<{ result?: (string | null)[] }>;
    const values = data[0]?.result;
    if (values) {
      for (let i = 0; i < fields.length; i++) {
        // Use a null/undefined check rather than a truthy test: "" is a
        // legitimate Redis hash value and must be preserved (see #3530).
        if (values[i] != null) result.set(fields[i]!, values[i]!);
      }
    }
  } catch (err) {
    console.warn('[redis] getHashFieldsBatch failed:', errMsg(err));
  }
  return result;
}

export async function runRedisPipeline(
  commands: Array<Array<string | number>>,
  raw = false,
): Promise<Array<{ result?: unknown }>> {
  if (commands.length === 0) return [];

  const backend = getCacheBackend();
  if (backend === 'local-file') {
    const { localCacheRunPipeline } = await import('./local-cache-store');
    const pipeline = commands.map((command) => {
      const [verb, ...rest] = command;
      if (raw || rest.length === 0 || typeof rest[0] !== 'string') {
        return command.map((part) => String(part));
      }
      return [String(verb), prefixKey(rest[0]), ...rest.slice(1).map((part) => String(part))];
    });
    try {
      return await localCacheRunPipeline(pipeline);
    } catch (err) {
      console.warn('[redis] local runRedisPipeline failed:', errMsg(err));
      return [];
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];

  const pipeline = commands.map((command) => {
    const [verb, ...rest] = command;
    if (raw || rest.length === 0 || typeof rest[0] !== 'string') {
      return command.map((part) => String(part));
    }
    return [String(verb), prefixKey(rest[0]), ...rest.slice(1).map((part) => String(part))];
  });

  try {
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[redis] runRedisPipeline HTTP ${resp.status}`);
      return [];
    }
    return await resp.json() as Array<{ result?: unknown }>;
  } catch (err) {
    console.warn('[redis] runRedisPipeline failed:', errMsg(err));
    return [];
  }
}

/**
 * Like `runRedisPipeline`, but rejects the whole batch if any command fails
 * (Upstash `/multi-exec` semantics) rather than best-effort per-command.
 * Callers publishing multiple related keys (e.g. a ranking + its metadata)
 * use this so readers never observe one written without the other.
 *
 * On the local-file backend there's no separate MULTI/EXEC concept — the
 * whole batch already runs synchronously inside one `mutateStore` call via
 * `localCacheRunPipeline`, so it's already all-or-nothing for practical
 * purposes and reuses that path directly.
 */
export async function runRedisTransaction(
  commands: Array<Array<string | number>>,
  raw = false,
): Promise<Array<{ result?: unknown; error?: unknown }>> {
  if (commands.length === 0) return [];

  const backend = getCacheBackend();
  if (backend === 'local-file') {
    const { localCacheRunPipeline } = await import('./local-cache-store');
    const pipeline = commands.map((command) => {
      const [verb, ...rest] = command;
      if (raw || rest.length === 0 || typeof rest[0] !== 'string') {
        return command.map((part) => String(part));
      }
      return [String(verb), prefixKey(rest[0]), ...rest.slice(1).map((part) => String(part))];
    });
    try {
      return await localCacheRunPipeline(pipeline);
    } catch (err) {
      console.warn('[redis] local runRedisTransaction failed:', errMsg(err));
      return [];
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];

  const pipeline = commands.map((command) => {
    const [verb, ...rest] = command;
    if (raw || rest.length === 0 || typeof rest[0] !== 'string') {
      return command.map((part) => String(part));
    }
    return [String(verb), prefixKey(rest[0]), ...rest.slice(1).map((part) => String(part))];
  });

  try {
    const resp = await fetch(`${url}/multi-exec`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[redis] runRedisTransaction HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json().catch(() => null) as Array<{ result?: unknown; error?: unknown }> | null;
    if (!Array.isArray(data)) {
      console.warn('[redis] runRedisTransaction returned an invalid response');
      return [];
    }
    return data;
  } catch (err) {
    console.warn('[redis] runRedisTransaction failed:', errMsg(err));
    return [];
  }
}

/**
 * Deletes `key` only if its current value equals `expectedValue`. Used to
 * release a lock without clobbering a lock someone else already acquired
 * after ours expired (the classic SET-NX / compare-DEL lock pattern).
 */
export async function compareAndDeleteRedisKey(key: string, expectedValue: string, raw = false): Promise<boolean> {
  if (!expectedValue) return false;

  const backend = getCacheBackend();
  const finalKey = raw ? key : prefixKey(key);

  if (backend === 'local-file') {
    const { localCacheCompareAndDelete } = await import('./local-cache-store');
    try {
      return await localCacheCompareAndDelete(finalKey, expectedValue);
    } catch (err) {
      console.warn('[redis] local compareAndDeleteRedisKey failed:', errMsg(err));
      return false;
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  try {
    const resp = await fetch(`${url}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', script, '1', finalKey, expectedValue]),
      signal: AbortSignal.timeout(REDIS_PIPELINE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[redis] compareAndDeleteRedisKey HTTP ${resp.status}`);
      return false;
    }
    const data = await resp.json().catch(() => null) as { result?: unknown; error?: string } | null;
    if (data?.error) {
      console.warn('[redis] compareAndDeleteRedisKey failed:', data.error);
      return false;
    }
    return data?.result === 1;
  } catch (err) {
    console.warn('[redis] compareAndDeleteRedisKey failed:', errMsg(err));
    return false;
  }
}
