type LocalCacheEntry = {
  value: string;
  expiresAt: number | null;
};

type LocalSortedSet = {
  members: Record<string, number>;
  expiresAt: number | null;
};

type LocalHash = {
  fields: Record<string, string>;
  expiresAt: number | null;
};

type LocalGeo = {
  members: Record<string, { lon: number; lat: number }>;
  expiresAt: number | null;
};

type LocalCacheStoreShape = {
  kv: Record<string, LocalCacheEntry>;
  zsets: Record<string, LocalSortedSet>;
  hashes: Record<string, LocalHash>;
  geos: Record<string, LocalGeo>;
};

// Note: cloneDefaultStore() is used to initialize the cache store


let cachedStorePath: string | null = null;
let cachedStore: LocalCacheStoreShape | null = null;
let pendingWrite: Promise<void> = Promise.resolve();

function nowMs(): number {
  return Date.now();
}

function cloneDefaultStore(): LocalCacheStoreShape {
  return {
    kv: {},
    zsets: {},
    hashes: {},
    geos: {},
  };
}

async function getNodeFs() {
  return import('node:fs/promises');
}

async function getNodePath() {
  return import('node:path');
}

async function resolveStorePath(): Promise<string> {
  if (cachedStorePath) return cachedStorePath;

  const path = await getNodePath();
  const configured = process.env.WM_LOCAL_CACHE_FILE?.trim();
  const cwd = typeof (process as any).cwd === 'function' ? (process as any).cwd() : '.';
  cachedStorePath = configured || path.resolve(cwd, '.worldmonitor-cache.json');
  return cachedStorePath;
}

function isExpired(expiresAt: number | null | undefined): boolean {
  return typeof expiresAt === 'number' && expiresAt <= nowMs();
}

function sweepExpired(store: LocalCacheStoreShape): boolean {
  let changed = false;

  for (const [key, entry] of Object.entries(store.kv)) {
    if (isExpired(entry.expiresAt)) {
      delete store.kv[key];
      changed = true;
    }
  }
  for (const [key, entry] of Object.entries(store.zsets)) {
    if (isExpired(entry.expiresAt)) {
      delete store.zsets[key];
      changed = true;
    }
  }
  for (const [key, entry] of Object.entries(store.hashes)) {
    if (isExpired(entry.expiresAt)) {
      delete store.hashes[key];
      changed = true;
    }
  }
  for (const [key, entry] of Object.entries(store.geos)) {
    if (isExpired(entry.expiresAt)) {
      delete store.geos[key];
      changed = true;
    }
  }

  return changed;
}

async function loadStore(): Promise<LocalCacheStoreShape> {
  if (cachedStore) return cachedStore;

  const fs = await getNodeFs();
  const storePath = await resolveStorePath();
  try {
    const raw = await fs.readFile(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LocalCacheStoreShape>;
    cachedStore = {
      kv: parsed.kv ?? {},
      zsets: parsed.zsets ?? {},
      hashes: parsed.hashes ?? {},
      geos: parsed.geos ?? {},
    };
  } catch {
    cachedStore = cloneDefaultStore();
  }

  if (sweepExpired(cachedStore)) {
    await persistStore(cachedStore);
  }
  return cachedStore;
}

async function persistStore(store: LocalCacheStoreShape): Promise<void> {
  const fs = await getNodeFs();
  const path = await getNodePath();
  const storePath = await resolveStorePath();
  const dir = path.dirname(storePath);
  const tmpPath = `${storePath}.tmp`;
  const payload = JSON.stringify(store);

  pendingWrite = pendingWrite.then(async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, payload, 'utf-8');
    await fs.rename(tmpPath, storePath);
  });

  await pendingWrite;
}

async function mutateStore<T>(mutator: (store: LocalCacheStoreShape) => T | Promise<T>): Promise<T> {
  const store = await loadStore();
  const result = await mutator(store);
  sweepExpired(store);
  await persistStore(store);
  return result;
}

function makeExpiresAt(ttlSeconds?: number | null): number | null {
  if (!ttlSeconds || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return null;
  return nowMs() + ttlSeconds * 1000;
}

function geoDistanceScore(
  centerLon: number,
  centerLat: number,
  pointLon: number,
  pointLat: number,
): number {
  const dx = (pointLon - centerLon) * Math.cos((centerLat * Math.PI) / 180);
  const dy = pointLat - centerLat;
  return dx * dx + dy * dy;
}

export async function localCacheGet(key: string): Promise<string | null> {
  const store = await loadStore();
  const entry = store.kv[key];
  if (!entry) return null;
  if (isExpired(entry.expiresAt)) {
    delete store.kv[key];
    await persistStore(store);
    return null;
  }
  return entry.value;
}

export async function localCacheSet(key: string, value: string, ttlSeconds?: number | null): Promise<void> {
  await mutateStore((store) => {
    store.kv[key] = { value, expiresAt: makeExpiresAt(ttlSeconds) };
  });
}

export async function localCacheGetBatch(keys: string[]): Promise<Map<string, string>> {
  const store = await loadStore();
  const result = new Map<string, string>();
  let changed = false;
  for (const key of keys) {
    const entry = store.kv[key];
    if (!entry) continue;
    if (isExpired(entry.expiresAt)) {
      delete store.kv[key];
      changed = true;
      continue;
    }
    result.set(key, entry.value);
  }
  if (changed) await persistStore(store);
  return result;
}

export async function localCacheGeoSearchByBox(
  key: string,
  lon: number,
  lat: number,
  widthKm: number,
  heightKm: number,
  count: number,
): Promise<string[]> {
  const store = await loadStore();
  const geo = store.geos[key];
  if (!geo) return [];
  if (isExpired(geo.expiresAt)) {
    delete store.geos[key];
    await persistStore(store);
    return [];
  }

  const lonRadius = widthKm / 2 / 111.32 / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const latRadius = heightKm / 2 / 111.32;

  return Object.entries(geo.members)
    .filter(([, point]) => Math.abs(point.lon - lon) <= lonRadius && Math.abs(point.lat - lat) <= latRadius)
    .sort((a, b) => geoDistanceScore(lon, lat, a[1].lon, a[1].lat) - geoDistanceScore(lon, lat, b[1].lon, b[1].lat))
    .slice(0, Math.max(0, count))
    .map(([member]) => member);
}

export async function localCacheHashGetBatch(key: string, fields: string[]): Promise<Map<string, string>> {
  const store = await loadStore();
  const hash = store.hashes[key];
  const result = new Map<string, string>();
  if (!hash) return result;
  if (isExpired(hash.expiresAt)) {
    delete store.hashes[key];
    await persistStore(store);
    return result;
  }
  for (const field of fields) {
    const value = hash.fields[field];
    if (typeof value === 'string') result.set(field, value);
  }
  return result;
}

function ensureZSet(store: LocalCacheStoreShape, key: string): LocalSortedSet {
  const existing = store.zsets[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next: LocalSortedSet = { members: {}, expiresAt: null };
  store.zsets[key] = next;
  return next;
}

function ensureHash(store: LocalCacheStoreShape, key: string): LocalHash {
  const existing = store.hashes[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next: LocalHash = { fields: {}, expiresAt: null };
  store.hashes[key] = next;
  return next;
}

function ensureGeo(store: LocalCacheStoreShape, key: string): LocalGeo {
  const existing = store.geos[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next: LocalGeo = { members: {}, expiresAt: null };
  store.geos[key] = next;
  return next;
}

function getZRangeDesc(zset: LocalSortedSet, start: number, stop: number): string[] {
  const sorted = Object.entries(zset.members)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([member]) => member);
  return sorted.slice(start, stop + 1);
}

export async function localCacheRunPipeline(
  commands: Array<Array<string | number>>,
): Promise<Array<{ result?: unknown }>> {
  return mutateStore((store) => {
    const results: Array<{ result?: unknown }> = [];

    for (const command of commands) {
      const [verbRaw, ...args] = command;
      const verb = String(verbRaw).toUpperCase();

      switch (verb) {
        case 'GET': {
          const key = String(args[0] ?? '');
          const entry = store.kv[key];
          if (!entry || isExpired(entry.expiresAt)) {
            delete store.kv[key];
            results.push({ result: null });
          } else {
            results.push({ result: entry.value });
          }
          break;
        }
        case 'SET': {
          const key = String(args[0] ?? '');
          const value = String(args[1] ?? '');
          let ttlSeconds: number | null = null;
          for (let i = 2; i < args.length - 1; i += 1) {
            if (String(args[i]).toUpperCase() === 'EX') {
              ttlSeconds = Number(args[i + 1] ?? 0);
              break;
            }
          }
          store.kv[key] = { value, expiresAt: makeExpiresAt(ttlSeconds) };
          results.push({ result: 'OK' });
          break;
        }
        case 'EXPIRE': {
          const key = String(args[0] ?? '');
          const ttlSeconds = Number(args[1] ?? 0);
          const expiresAt = makeExpiresAt(ttlSeconds);
          let updated = 0;
          if (store.kv[key]) {
            store.kv[key]!.expiresAt = expiresAt;
            updated = 1;
          } else if (store.zsets[key]) {
            store.zsets[key]!.expiresAt = expiresAt;
            updated = 1;
          } else if (store.hashes[key]) {
            store.hashes[key]!.expiresAt = expiresAt;
            updated = 1;
          } else if (store.geos[key]) {
            store.geos[key]!.expiresAt = expiresAt;
            updated = 1;
          }
          results.push({ result: updated });
          break;
        }
        case 'DEL': {
          let deleted = 0;
          for (const keyRaw of args) {
            const key = String(keyRaw);
            if (store.kv[key]) { delete store.kv[key]; deleted += 1; }
            if (store.zsets[key]) { delete store.zsets[key]; deleted += 1; }
            if (store.hashes[key]) { delete store.hashes[key]; deleted += 1; }
            if (store.geos[key]) { delete store.geos[key]; deleted += 1; }
          }
          results.push({ result: deleted });
          break;
        }
        case 'ZADD': {
          const key = String(args[0] ?? '');
          const zset = ensureZSet(store, key);
          let added = 0;
          for (let i = 1; i < args.length - 1; i += 2) {
            const score = Number(args[i] ?? 0);
            const member = String(args[i + 1] ?? '');
            if (!(member in zset.members)) added += 1;
            zset.members[member] = score;
          }
          results.push({ result: added });
          break;
        }
        case 'ZREM': {
          const key = String(args[0] ?? '');
          const zset = store.zsets[key];
          let removed = 0;
          if (zset && !isExpired(zset.expiresAt)) {
            for (const memberRaw of args.slice(1)) {
              const member = String(memberRaw);
              if (member in zset.members) {
                delete zset.members[member];
                removed += 1;
              }
            }
          }
          results.push({ result: removed });
          break;
        }
        case 'ZREVRANGE': {
          const key = String(args[0] ?? '');
          const start = Number(args[1] ?? 0);
          const stop = Number(args[2] ?? -1);
          const zset = store.zsets[key];
          if (!zset || isExpired(zset.expiresAt)) {
            delete store.zsets[key];
            results.push({ result: [] });
            break;
          }
          results.push({ result: getZRangeDesc(zset, start, stop) });
          break;
        }
        case 'HMGET': {
          const key = String(args[0] ?? '');
          const fields = args.slice(1).map((field) => String(field));
          const hash = store.hashes[key];
          if (!hash || isExpired(hash.expiresAt)) {
            delete store.hashes[key];
            results.push({ result: fields.map(() => null) });
            break;
          }
          results.push({ result: fields.map((field) => hash.fields[field] ?? null) });
          break;
        }
        case 'HSET': {
          const key = String(args[0] ?? '');
          const hash = ensureHash(store, key);
          let updated = 0;
          for (let i = 1; i < args.length - 1; i += 2) {
            const field = String(args[i] ?? '');
            const value = String(args[i + 1] ?? '');
            if (!(field in hash.fields)) updated += 1;
            hash.fields[field] = value;
          }
          results.push({ result: updated });
          break;
        }
        case 'GEOADD': {
          const key = String(args[0] ?? '');
          const geo = ensureGeo(store, key);
          let added = 0;
          for (let i = 1; i < args.length - 2; i += 3) {
            const memberLon = Number(args[i] ?? 0);
            const memberLat = Number(args[i + 1] ?? 0);
            const member = String(args[i + 2] ?? '');
            if (!(member in geo.members)) added += 1;
            geo.members[member] = { lon: memberLon, lat: memberLat };
          }
          results.push({ result: added });
          break;
        }
        default:
          results.push({ result: null });
          break;
      }
    }

    return results;
  });
}

// Atomic (single-process) compare-and-delete: deletes `key` only if its
// current value equals `expectedValue`. Used to release a lock only if it's
// still owned by the caller. mutateStore's callback runs synchronously
// against the in-memory store, so the read+delete here can't race with
// another mutateStore call the way two separate localCacheRunPipeline
// round-trips could.
export async function localCacheCompareAndDelete(key: string, expectedValue: string): Promise<boolean> {
  return mutateStore((store) => {
    const entry = store.kv[key];
    if (!entry || isExpired(entry.expiresAt) || entry.value !== expectedValue) return false;
    delete store.kv[key];
    return true;
  });
}

export async function resetLocalCacheStoreForTests(): Promise<void> {
  cachedStore = null;
  cachedStorePath = null;
  pendingWrite = Promise.resolve();
}
