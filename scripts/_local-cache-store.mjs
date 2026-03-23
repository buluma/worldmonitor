import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function nowMs() {
  return Date.now();
}

function makeEmptyStore() {
  return {
    kv: {},
    hashes: {},
    geos: {},
    lists: {},
  };
}

let cachedPath = null;
let cachedStore = null;
let pendingWrite = Promise.resolve();

function isExpired(expiresAt) {
  return typeof expiresAt === 'number' && expiresAt <= nowMs();
}

function makeExpiresAt(mode, value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (mode === 'PX') return nowMs() + num;
  return nowMs() + num * 1000;
}

async function resolveStorePath() {
  if (cachedPath) return cachedPath;
  cachedPath = (process.env.WM_LOCAL_CACHE_FILE || '').trim() || path.resolve(process.cwd(), '.worldmonitor-cache.json');
  return cachedPath;
}

async function persist(store) {
  const target = await resolveStorePath();
  const dir = path.dirname(target);
  const temp = `${target}.tmp`;
  const payload = JSON.stringify(store);
  pendingWrite = pendingWrite.then(async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(temp, payload, 'utf-8');
    await rename(temp, target);
  });
  await pendingWrite;
}

function sweep(store) {
  let changed = false;
  for (const bucket of ['kv', 'hashes', 'geos', 'lists']) {
    for (const [key, value] of Object.entries(store[bucket])) {
      if (isExpired(value.expiresAt)) {
        delete store[bucket][key];
        changed = true;
      }
    }
  }
  return changed;
}

async function loadStore() {
  if (cachedStore) return cachedStore;
  try {
    const raw = await readFile(await resolveStorePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    cachedStore = {
      kv: parsed.kv || {},
      hashes: parsed.hashes || {},
      geos: parsed.geos || {},
      lists: parsed.lists || {},
    };
  } catch {
    cachedStore = makeEmptyStore();
  }
  if (sweep(cachedStore)) await persist(cachedStore);
  return cachedStore;
}

async function mutate(mutator) {
  const store = await loadStore();
  const result = await mutator(store);
  sweep(store);
  await persist(store);
  return result;
}

function ensureHash(store, key) {
  const existing = store.hashes[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next = { fields: {}, expiresAt: null };
  store.hashes[key] = next;
  return next;
}

function ensureGeo(store, key) {
  const existing = store.geos[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next = { members: {}, expiresAt: null };
  store.geos[key] = next;
  return next;
}

function ensureList(store, key) {
  const existing = store.lists[key];
  if (existing && !isExpired(existing.expiresAt)) return existing;
  const next = { items: [], expiresAt: null };
  store.lists[key] = next;
  return next;
}

function randomMembers(values, count) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, count));
}

export async function localCacheGet(key) {
  const store = await loadStore();
  const entry = store.kv[key];
  if (!entry) return null;
  if (isExpired(entry.expiresAt)) {
    delete store.kv[key];
    await persist(store);
    return null;
  }
  return entry.value;
}

export async function localCacheSet(key, value, ttlSeconds = null) {
  await mutate((store) => {
    store.kv[key] = { value, expiresAt: makeExpiresAt('EX', ttlSeconds) };
  });
}

export async function localCacheRunCommands(commands) {
  return mutate((store) => {
    const results = [];

    for (const command of commands) {
      const [verbRaw, ...args] = command;
      const verb = String(verbRaw).toUpperCase();

      switch (verb) {
        case 'GET': {
          const key = String(args[0] || '');
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
          const key = String(args[0] || '');
          const value = String(args[1] || '');
          let nx = false;
          let expiresAt = null;
          for (let i = 2; i < args.length; i += 1) {
            const flag = String(args[i] || '').toUpperCase();
            if (flag === 'NX') {
              nx = true;
            } else if (flag === 'EX' || flag === 'PX') {
              expiresAt = makeExpiresAt(flag, args[i + 1]);
              i += 1;
            }
          }
          if (nx && store.kv[key] && !isExpired(store.kv[key].expiresAt)) {
            results.push({ result: null });
            break;
          }
          store.kv[key] = { value, expiresAt };
          results.push({ result: 'OK' });
          break;
        }
        case 'DEL': {
          const keys = args.map((arg) => String(arg));
          let removed = 0;
          for (const key of keys) {
            if (store.kv[key]) { delete store.kv[key]; removed += 1; }
            if (store.hashes[key]) { delete store.hashes[key]; removed += 1; }
            if (store.geos[key]) { delete store.geos[key]; removed += 1; }
            if (store.lists[key]) { delete store.lists[key]; removed += 1; }
          }
          results.push({ result: removed });
          break;
        }
        case 'EXPIRE': {
          const key = String(args[0] || '');
          const expiresAt = makeExpiresAt('EX', args[1]);
          let updated = 0;
          for (const bucket of ['kv', 'hashes', 'geos', 'lists']) {
            if (store[bucket][key]) {
              store[bucket][key].expiresAt = expiresAt;
              updated = 1;
              break;
            }
          }
          results.push({ result: updated });
          break;
        }
        case 'HSET': {
          const key = String(args[0] || '');
          const hash = ensureHash(store, key);
          let added = 0;
          for (let i = 1; i < args.length - 1; i += 2) {
            const field = String(args[i] || '');
            const value = String(args[i + 1] || '');
            if (!(field in hash.fields)) added += 1;
            hash.fields[field] = value;
          }
          results.push({ result: added });
          break;
        }
        case 'HMGET': {
          const key = String(args[0] || '');
          const fields = args.slice(1).map((arg) => String(arg));
          const hash = store.hashes[key];
          if (!hash || isExpired(hash.expiresAt)) {
            delete store.hashes[key];
            results.push({ result: fields.map(() => null) });
          } else {
            results.push({ result: fields.map((field) => hash.fields[field] ?? null) });
          }
          break;
        }
        case 'HLEN': {
          const key = String(args[0] || '');
          const hash = store.hashes[key];
          if (!hash || isExpired(hash.expiresAt)) {
            delete store.hashes[key];
            results.push({ result: 0 });
          } else {
            results.push({ result: Object.keys(hash.fields).length });
          }
          break;
        }
        case 'GEOADD': {
          const key = String(args[0] || '');
          const geo = ensureGeo(store, key);
          let added = 0;
          for (let i = 1; i < args.length - 2; i += 3) {
            const lon = Number(args[i] || 0);
            const lat = Number(args[i + 1] || 0);
            const member = String(args[i + 2] || '');
            if (!(member in geo.members)) added += 1;
            geo.members[member] = { lon, lat };
          }
          results.push({ result: added });
          break;
        }
        case 'ZCARD': {
          const key = String(args[0] || '');
          const geo = store.geos[key];
          if (!geo || isExpired(geo.expiresAt)) {
            delete store.geos[key];
            results.push({ result: 0 });
          } else {
            results.push({ result: Object.keys(geo.members).length });
          }
          break;
        }
        case 'ZRANDMEMBER': {
          const key = String(args[0] || '');
          const count = Number(args[1] || 1);
          const geo = store.geos[key];
          if (!geo || isExpired(geo.expiresAt)) {
            delete store.geos[key];
            results.push({ result: [] });
          } else {
            results.push({ result: randomMembers(Object.keys(geo.members), count) });
          }
          break;
        }
        case 'LPUSH': {
          const key = String(args[0] || '');
          const list = ensureList(store, key);
          const values = args.slice(1).map((arg) => String(arg));
          list.items.unshift(...values);
          results.push({ result: list.items.length });
          break;
        }
        case 'LTRIM': {
          const key = String(args[0] || '');
          const start = Number(args[1] || 0);
          const stop = Number(args[2] || -1);
          const list = ensureList(store, key);
          list.items = list.items.slice(start, stop + 1);
          results.push({ result: 'OK' });
          break;
        }
        case 'LRANGE': {
          const key = String(args[0] || '');
          const start = Number(args[1] || 0);
          const stop = Number(args[2] || -1);
          const list = store.lists[key];
          if (!list || isExpired(list.expiresAt)) {
            delete store.lists[key];
            results.push({ result: [] });
          } else {
            results.push({ result: list.items.slice(start, stop + 1) });
          }
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
