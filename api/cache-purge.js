// api/_cors.js
var ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/(.*\.)?wm\.opsio\.space$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-elie-[a-z0-9]+\.vercel\.app$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/
];
function isAllowedOrigin(origin) {
  return Boolean(origin) && ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}
function getCorsHeaders(req, methods = "GET, OPTIONS") {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : "https://wm.opsio.space";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

// api/_json-response.js
function sanitizeJsonValue(value, depth = 0) {
  if (depth > 20) return "[truncated]";
  if (value instanceof Error) {
    return { error: value.message };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const clone = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "stack" || key === "stackTrace" || key === "cause") continue;
      clone[key] = sanitizeJsonValue(nested, depth + 1);
    }
    return clone;
  }
  return value;
}
function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(sanitizeJsonValue(body)), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

// api/_observability.js
var EDGE_FLUSH_TIMEOUT_MS = 1500;
function cleanEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}
function parseSampleRate(rawValue, fallback) {
  const parsed = Number.parseFloat(String(rawValue ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}
function getEdgeDsn() {
  return cleanEnv(process.env.SENTRY_EDGE_DSN || process.env.SENTRY_DSN);
}
function getGlobalSentry() {
  const sentry = globalThis.Sentry;
  return sentry && typeof sentry === "object" ? sentry : null;
}
function ensureEdgeSentryInitialized() {
  const sentry = getGlobalSentry();
  if (!sentry || typeof sentry.init !== "function") return null;
  const dsn = getEdgeDsn();
  sentry.init({
    dsn: dsn || void 0,
    enabled: Boolean(dsn),
    release: cleanEnv(process.env.SENTRY_RELEASE) || "worldmonitor@edge",
    environment: cleanEnv(process.env.SENTRY_ENVIRONMENT) || cleanEnv(process.env.VERCEL_ENV) || cleanEnv(process.env.NODE_ENV) || "development",
    sendDefaultPii: true,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_EDGE_TRACES_SAMPLE_RATE, 0.1),
    initialScope: {
      tags: {
        runtime: "vercel-edge"
      }
    }
  });
  return sentry;
}
async function captureEdgeFailure(handlerName, request, status, error) {
  const sentry = getGlobalSentry();
  const url = new URL(request.url);
  if (sentry && typeof sentry.withScope === "function") {
    sentry.withScope((scope) => {
      scope?.setTag?.("handler", handlerName);
      scope?.setTag?.("runtime", "vercel-edge");
      scope?.setTag?.("http.status_code", String(status));
      scope?.setContext?.("request", {
        method: request.method,
        url: request.url,
        path: url.pathname,
        query: url.search
      });
      if (error) {
        sentry.captureException?.(error);
        return;
      }
      sentry.captureMessage?.(`Edge handler returned HTTP ${status}: ${handlerName}`, "error");
    });
    try {
      await sentry.flush?.(EDGE_FLUSH_TIMEOUT_MS);
    } catch {
    }
    return;
  }
  if (error) {
    console.error(`[edge:${handlerName}]`, error);
  } else {
    console.error(`[edge:${handlerName}] HTTP ${status} ${url.pathname}`);
  }
}
function withEdgeObservability(handlerName, handler2, options = {}) {
  const captureStatusFailures = options.captureStatusFailures !== false;
  const captureThrownFailures = options.captureThrownFailures !== false;
  return async function observedHandler(request) {
    const sentry = ensureEdgeSentryInitialized();
    const url = new URL(request.url);
    const runHandler = async () => {
      try {
        const response = await handler2(request);
        sentry?.setHttpStatus?.(null, response.status);
        if (captureStatusFailures && response.status >= 500) {
          await captureEdgeFailure(handlerName, request, response.status, null);
        }
        return response;
      } catch (error) {
        sentry?.setHttpStatus?.(null, 500);
        if (captureThrownFailures) {
          await captureEdgeFailure(handlerName, request, 500, error);
        }
        throw error;
      }
    };
    if (sentry?.continueTrace && sentry?.startSpan) {
      return sentry.continueTrace(
        {
          sentryTrace: request.headers.get("sentry-trace"),
          baggage: request.headers.get("baggage")
        },
        () => sentry.startSpan(
          {
            name: `${request.method} ${url.pathname}`,
            op: "http.server",
            attributes: {
              "http.request.method": request.method,
              "url.path": url.pathname,
              "wm.handler": handlerName
            }
          },
          runHandler
        )
      );
    }
    return runHandler();
  };
}

// api/cache-purge.js
var config = { runtime: "edge" };
var MAX_EXPLICIT_KEYS = 20;
var MAX_PATTERNS = 3;
var MAX_DELETIONS = 200;
var MAX_SCAN_ITERATIONS = 5;
var BLOCKLIST_PREFIXES = ["rl:", "__"];
var DURABLE_DATA_PREFIXES = ["military:bases:", "conflict:iran-events:", "conflict:ucdp-events:"];
function getKeyPrefix() {
  const env = process.env.VERCEL_ENV;
  if (!env || env === "production") return "";
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev";
  return `${env}:${sha}:`;
}
function isBlocklisted(key) {
  return BLOCKLIST_PREFIXES.some((p) => key.startsWith(p));
}
function isDurableData(key) {
  return DURABLE_DATA_PREFIXES.some((p) => key.startsWith(p));
}
function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return { url, token };
}
async function redisPipeline(commands) {
  const { url, token } = getRedisCredentials();
  const resp = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(1e4)
  });
  if (!resp.ok) throw new Error(`Redis pipeline HTTP ${resp.status}`);
  return resp.json();
}
async function redisScan(pattern, maxIterations) {
  const { url, token } = getRedisCredentials();
  const keys = [];
  let cursor = "0";
  let truncated = false;
  for (let i = 0; i < maxIterations; i++) {
    const resp = await fetch(
      `${url}/scan/${encodeURIComponent(cursor)}/MATCH/${encodeURIComponent(pattern)}/COUNT/100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5e3)
      }
    );
    if (!resp.ok) throw new Error(`Redis SCAN HTTP ${resp.status}`);
    const data = await resp.json();
    const [nextCursor, batch] = data.result;
    if (batch?.length) keys.push(...batch);
    cursor = String(nextCursor);
    if (cursor === "0") break;
    if (i === maxIterations - 1) truncated = true;
  }
  return { keys, truncated };
}
async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  const key = await crypto.subtle.importKey("raw", aBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, bBuf);
  const expected = await crypto.subtle.sign("HMAC", key, aBuf);
  const sigArr = new Uint8Array(sig);
  const expArr = new Uint8Array(expected);
  if (sigArr.length !== expArr.length) return false;
  let diff = 0;
  for (let i = 0; i < sigArr.length; i++) diff |= sigArr[i] ^ expArr[i];
  return diff === 0;
}
async function handler(req) {
  const corsHeaders = getCorsHeaders(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.RELAY_SHARED_SECRET;
  if (!secret || !await timingSafeEqual(auth, `Bearer ${secret}`)) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 422, corsHeaders);
  }
  const { keys: explicitKeys, patterns, dryRun = false } = body || {};
  const hasKeys = Array.isArray(explicitKeys) && explicitKeys.length > 0;
  const hasPatterns = Array.isArray(patterns) && patterns.length > 0;
  if (!hasKeys && !hasPatterns) {
    return jsonResponse({ error: 'At least one of "keys" or "patterns" required' }, 422, corsHeaders);
  }
  if (hasKeys && explicitKeys.length > MAX_EXPLICIT_KEYS) {
    return jsonResponse({ error: `"keys" exceeds max of ${MAX_EXPLICIT_KEYS}` }, 422, corsHeaders);
  }
  if (hasPatterns && patterns.length > MAX_PATTERNS) {
    return jsonResponse({ error: `"patterns" exceeds max of ${MAX_PATTERNS}` }, 422, corsHeaders);
  }
  if (hasPatterns) {
    for (const p of patterns) {
      if (typeof p !== "string" || !p.endsWith("*") || p === "*") {
        return jsonResponse({ error: `Invalid pattern "${p}": must end with "*" and cannot be bare "*"` }, 422, corsHeaders);
      }
    }
  }
  const prefix = getKeyPrefix();
  const allKeys = /* @__PURE__ */ new Set();
  let truncated = false;
  if (hasKeys) {
    for (const k of explicitKeys) {
      if (typeof k !== "string" || !k) continue;
      if (isBlocklisted(k)) continue;
      allKeys.add(k);
    }
  }
  if (hasPatterns) {
    for (const p of patterns) {
      const prefixedPattern = prefix ? `${prefix}${p}` : p;
      const scan = await redisScan(prefixedPattern, MAX_SCAN_ITERATIONS);
      if (scan.truncated) truncated = true;
      for (const rawKey of scan.keys) {
        const unprefixed = prefix && rawKey.startsWith(prefix) ? rawKey.slice(prefix.length) : rawKey;
        if (isBlocklisted(unprefixed)) continue;
        if (isDurableData(unprefixed)) continue;
        allKeys.add(unprefixed);
      }
    }
  }
  const keyList = [...allKeys].slice(0, MAX_DELETIONS);
  if (keyList.length < allKeys.size) truncated = true;
  const ip = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  if (dryRun) {
    console.log("[cache-purge]", { mode: "dry-run", matched: keyList.length, deleted: 0, truncated, dryRun: true, ip, ts });
    return jsonResponse({ matched: keyList.length, deleted: 0, keys: keyList, dryRun: true, truncated }, 200, corsHeaders);
  }
  if (keyList.length === 0) {
    console.log("[cache-purge]", { mode: "purge", matched: 0, deleted: 0, truncated, dryRun: false, ip, ts });
    return jsonResponse({ matched: 0, deleted: 0, keys: [], dryRun: false, truncated }, 200, corsHeaders);
  }
  let deleted = 0;
  try {
    const commands = keyList.map((k) => ["DEL", prefix ? `${prefix}${k}` : k]);
    const results = await redisPipeline(commands);
    deleted = results.reduce((sum, r) => sum + (r.result || 0), 0);
  } catch (err) {
    console.log("[cache-purge]", { mode: "purge-error", matched: keyList.length, error: err.message, ip, ts });
    return jsonResponse({ error: "Redis pipeline failed" }, 502, corsHeaders);
  }
  console.log("[cache-purge]", { mode: "purge", matched: keyList.length, deleted, truncated, dryRun: false, ip, ts });
  return jsonResponse({ matched: keyList.length, deleted, keys: keyList, dryRun: false, truncated }, 200, corsHeaders);
}
var cache_purge_default = withEdgeObservability("/api/cache-purge", handler);
export {
  config,
  cache_purge_default as default
};
