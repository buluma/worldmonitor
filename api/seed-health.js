// api/_cors.js
var ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
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
function isDisallowedOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return !isAllowedOrigin(origin);
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

// api/_api-key.js
var DESKTOP_ORIGIN_PATTERNS = [
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/
];
var BROWSER_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-elie-[a-z0-9]+\.vercel\.app$/,
  ...process.env.NODE_ENV === "production" ? [] : [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/
  ]
];
function isDesktopOrigin(origin) {
  return Boolean(origin) && DESKTOP_ORIGIN_PATTERNS.some((p) => p.test(origin));
}
function isTrustedBrowserOrigin(origin) {
  return Boolean(origin) && BROWSER_ORIGIN_PATTERNS.some((p) => p.test(origin));
}
function extractOriginFromReferer(referer) {
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}
function validateApiKey(req, _options = {}) {
  const key = req.headers.get("X-WorldMonitor-Key");
  const origin = req.headers.get("Origin") || extractOriginFromReferer(req.headers.get("Referer")) || "";
  if (isDesktopOrigin(origin)) {
    if (key) {
      const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || "").split(",").filter(Boolean);
      if (validKeys.length > 0 && !validKeys.includes(key)) return { valid: false, required: true, error: "Invalid API key" };
    }
    return { valid: true, required: false };
  }
  if (isTrustedBrowserOrigin(origin)) {
    if (key) {
      const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || "").split(",").filter(Boolean);
      if (validKeys.length > 0 && !validKeys.includes(key)) return { valid: false, required: true, error: "Invalid API key" };
    }
    return { valid: true, required: false };
  }
  if (key) {
    const validKeys = (process.env.WORLDMONITOR_VALID_KEYS || "").split(",").filter(Boolean);
    if (!validKeys.includes(key)) return { valid: false, required: true, error: "Invalid API key" };
    return { valid: true, required: true };
  }
  return { valid: false, required: true, error: "API key required" };
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

// api/seed-health.js
var config = { runtime: "edge" };
var SEED_DOMAINS = {
  // Phase 1 — Snapshot endpoints
  "seismology:earthquakes": { key: "seed-meta:seismology:earthquakes", intervalMin: 15 },
  "wildfire:fires": { key: "seed-meta:wildfire:fires", intervalMin: 60 },
  "infra:outages": { key: "seed-meta:infra:outages", intervalMin: 15 },
  "climate:anomalies": { key: "seed-meta:climate:anomalies", intervalMin: 60 },
  // Phase 2 — Parameterized endpoints
  "unrest:events": { key: "seed-meta:unrest:events", intervalMin: 15 },
  "cyber:threats": { key: "seed-meta:cyber:threats", intervalMin: 240 },
  "market:crypto": { key: "seed-meta:market:crypto", intervalMin: 15 },
  "market:etf-flows": { key: "seed-meta:market:etf-flows", intervalMin: 30 },
  "market:gulf-quotes": { key: "seed-meta:market:gulf-quotes", intervalMin: 15 },
  "market:stablecoins": { key: "seed-meta:market:stablecoins", intervalMin: 30 },
  // Phase 3 — Hybrid endpoints
  "natural:events": { key: "seed-meta:natural:events", intervalMin: 60 },
  "displacement:summary": { key: "seed-meta:displacement:summary", intervalMin: 360 },
  // Aligned with health.js SEED_META (intervalMin = maxStaleMin / 2)
  "market:stocks": { key: "seed-meta:market:stocks", intervalMin: 15 },
  "market:commodities": { key: "seed-meta:market:commodities", intervalMin: 15 },
  "market:sectors": { key: "seed-meta:market:sectors", intervalMin: 15 },
  "aviation:faa": { key: "seed-meta:aviation:faa", intervalMin: 45 },
  "news:insights": { key: "seed-meta:news:insights", intervalMin: 15 },
  "positive-events:geo": { key: "seed-meta:positive-events:geo", intervalMin: 30 },
  "risk:scores:sebuf": { key: "seed-meta:risk:scores:sebuf", intervalMin: 15 },
  "conflict:iran-events": { key: "seed-meta:conflict:iran-events", intervalMin: 5040 },
  "conflict:ucdp-events": { key: "seed-meta:conflict:ucdp-events", intervalMin: 210 },
  "weather:alerts": { key: "seed-meta:weather:alerts", intervalMin: 15 },
  "economic:spending": { key: "seed-meta:economic:spending", intervalMin: 60 },
  "intelligence:gpsjam": { key: "seed-meta:intelligence:gpsjam", intervalMin: 360 },
  "intelligence:satellites": { key: "seed-meta:intelligence:satellites", intervalMin: 90 },
  "military:flights": { key: "seed-meta:military:flights", intervalMin: 8 },
  "military-forecast-inputs": { key: "seed-meta:military-forecast-inputs", intervalMin: 8 },
  "infra:service-statuses": { key: "seed-meta:infra:service-statuses", intervalMin: 60 },
  "supply_chain:shipping": { key: "seed-meta:supply_chain:shipping", intervalMin: 120 },
  "supply_chain:chokepoints": { key: "seed-meta:supply_chain:chokepoints", intervalMin: 30 },
  "cable-health": { key: "seed-meta:cable-health", intervalMin: 30 },
  "prediction:markets": { key: "seed-meta:prediction:markets", intervalMin: 8 },
  "aviation:intl": { key: "seed-meta:aviation:intl", intervalMin: 15 },
  "theater-posture": { key: "seed-meta:theater-posture", intervalMin: 8 },
  "economic:worldbank-techreadiness": { key: "seed-meta:economic:worldbank-techreadiness:v1", intervalMin: 5040 },
  "economic:worldbank-progress": { key: "seed-meta:economic:worldbank-progress:v1", intervalMin: 5040 },
  "economic:worldbank-renewable": { key: "seed-meta:economic:worldbank-renewable:v1", intervalMin: 5040 },
  "research:tech-events": { key: "seed-meta:research:tech-events", intervalMin: 240 },
  "intelligence:gdelt-intel": { key: "seed-meta:intelligence:gdelt-intel", intervalMin: 210 },
  // 420min maxStaleMin / 2 — aligned with health.js (6h cron + 1h grace)
  "correlation:cards": { key: "seed-meta:correlation:cards", intervalMin: 5 },
  "intelligence:advisories": { key: "seed-meta:intelligence:advisories", intervalMin: 60 },
  "trade:customs-revenue": { key: "seed-meta:trade:customs-revenue", intervalMin: 720 },
  "thermal:escalation": { key: "seed-meta:thermal:escalation", intervalMin: 180 },
  "radiation:observations": { key: "seed-meta:radiation:observations", intervalMin: 15 },
  "sanctions:pressure": { key: "seed-meta:sanctions:pressure", intervalMin: 360 },
  "economic:grocery-basket": { key: "seed-meta:economic:grocery-basket", intervalMin: 5040 },
  // weekly seed; intervalMin = maxStaleMin / 2
  "economic:bigmac": { key: "seed-meta:economic:bigmac", intervalMin: 5040 }
  // weekly seed; intervalMin = maxStaleMin / 2
};
async function getMetaBatch(keys) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  const pipeline = keys.map((k) => ["GET", k]);
  const resp = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(pipeline),
    signal: AbortSignal.timeout(3e3)
  });
  if (!resp.ok) throw new Error(`Redis HTTP ${resp.status}`);
  const data = await resp.json();
  const result = /* @__PURE__ */ new Map();
  for (let i = 0; i < keys.length; i++) {
    const raw = data[i]?.result;
    if (raw) {
      try {
        result.set(keys[i], JSON.parse(raw));
      } catch {
      }
    }
  }
  return result;
}
async function handler(req) {
  if (isDisallowedOrigin(req))
    return new Response("Forbidden", { status: 403 });
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  const apiKeyResult = validateApiKey(req);
  if (apiKeyResult.required && !apiKeyResult.valid)
    return jsonResponse({ error: apiKeyResult.error }, 401, cors);
  const now = Date.now();
  const entries = Object.entries(SEED_DOMAINS);
  const metaKeys = entries.map(([, v]) => v.key);
  let metaMap;
  try {
    metaMap = await getMetaBatch(metaKeys);
  } catch {
    return jsonResponse({ error: "Redis unavailable" }, 503, cors);
  }
  const seeds = {};
  let staleCount = 0;
  let missingCount = 0;
  for (const [domain, cfg] of entries) {
    const meta = metaMap.get(cfg.key);
    const maxStalenessMs = cfg.intervalMin * 2 * 60 * 1e3;
    if (!meta) {
      seeds[domain] = { status: "missing", fetchedAt: null, recordCount: null, stale: true };
      missingCount++;
      continue;
    }
    const ageMs = now - (meta.fetchedAt || 0);
    const stale = ageMs > maxStalenessMs;
    if (stale) staleCount++;
    seeds[domain] = {
      status: stale ? "stale" : "ok",
      fetchedAt: meta.fetchedAt,
      recordCount: meta.recordCount ?? null,
      sourceVersion: meta.sourceVersion || null,
      ageMinutes: Math.round(ageMs / 6e4),
      stale
    };
  }
  const overall = missingCount > 0 ? "degraded" : staleCount > 0 ? "warning" : "healthy";
  const httpStatus = overall === "healthy" ? 200 : overall === "warning" ? 200 : 503;
  return jsonResponse({ overall, seeds, checkedAt: now }, httpStatus, {
    ...cors,
    "Cache-Control": "no-cache"
  });
}
var seed_health_default = withEdgeObservability("/api/seed-health", handler, {
  captureStatusFailures: false
});
export {
  config,
  seed_health_default as default
};
