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
function getPublicCorsHeaders(methods = "GET, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-WorldMonitor-Key",
    "Access-Control-Max-Age": "86400"
  };
}
function isDisallowedOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return !isAllowedOrigin(origin);
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
  /^https:\/\/(.*\.)?wm\.opsio\.space$/,
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

// api/bootstrap.js
var config = { runtime: "edge" };
var LOCAL_FILE_STORE_EMPTY = { kv: {} };
var BOOTSTRAP_CACHE_KEYS = {
  earthquakes: "seismology:earthquakes:v1",
  outages: "infra:outages:v1",
  serviceStatuses: "infra:service-statuses:v1",
  sectors: "market:sectors:v1",
  etfFlows: "market:etf-flows:v1",
  macroSignals: "economic:macro-signals:v1",
  bisPolicy: "economic:bis:policy:v1",
  bisExchange: "economic:bis:eer:v1",
  bisCredit: "economic:bis:credit:v1",
  shippingRates: "supply_chain:shipping:v2",
  chokepoints: "supply_chain:chokepoints:v4",
  chokepointTransits: "supply_chain:chokepoint_transits:v1",
  minerals: "supply_chain:minerals:v2",
  giving: "giving:summary:v1",
  climateAnomalies: "climate:anomalies:v1",
  radiationWatch: "radiation:observations:v1",
  thermalEscalation: "thermal:escalation:v1",
  wildfires: "wildfire:fires:v1",
  marketQuotes: "market:stocks-bootstrap:v1",
  commodityQuotes: "market:commodities-bootstrap:v1",
  cyberThreats: "cyber:threats-bootstrap:v2",
  techReadiness: "economic:worldbank-techreadiness:v1",
  progressData: "economic:worldbank-progress:v1",
  renewableEnergy: "economic:worldbank-renewable:v1",
  positiveGeoEvents: "positive_events:geo-bootstrap:v1",
  theaterPosture: "theater_posture:sebuf:stale:v1",
  riskScores: "risk:scores:sebuf:stale:v1",
  naturalEvents: "natural:events:v1",
  flightDelays: "aviation:delays-bootstrap:v1",
  insights: "news:insights:v1",
  predictions: "prediction:markets-bootstrap:v1",
  cryptoQuotes: "market:crypto:v1",
  gulfQuotes: "market:gulf-quotes:v1",
  stablecoinMarkets: "market:stablecoins:v1",
  unrestEvents: "unrest:events:v1",
  iranEvents: "conflict:iran-events:v1",
  ucdpEvents: "conflict:ucdp-events:v1",
  temporalAnomalies: "temporal:anomalies:v1",
  weatherAlerts: "weather:alerts:v1",
  spending: "economic:spending:v1",
  techEvents: "research:tech-events-bootstrap:v1",
  gdeltIntel: "intelligence:gdelt-intel:v1",
  correlationCards: "correlation:cards-bootstrap:v1",
  securityAdvisories: "intelligence:advisories-bootstrap:v1",
  forecasts: "forecast:predictions:v2",
  customsRevenue: "trade:customs-revenue:v1",
  sanctionsPressure: "sanctions:pressure:v1",
  consumerPricesOverview: "consumer-prices:overview:ae",
  consumerPricesCategories: "consumer-prices:categories:ae:30d",
  consumerPricesMovers: "consumer-prices:movers:ae:30d",
  consumerPricesSpread: "consumer-prices:retailer-spread:ae:essentials-ae",
  groceryBasket: "economic:grocery-basket:v1",
  bigmac: "economic:bigmac:v1",
  cryptoSectors: "market:crypto-sectors:v1",
  defiTokens: "market:defi-tokens:v1",
  aiTokens: "market:ai-tokens:v1",
  otherTokens: "market:other-tokens:v1",
  nationalDebt: "economic:national-debt:v1",
  hfPropagation: "rf:propagation:v1",
  localAdsb: "adsb:local:v1",
  acars: "acars:messages:v1",
  pipelinesGas: "energy:pipelines:gas:v1",
  pipelinesOil: "energy:pipelines:oil:v1",
  storageFacilities: "energy:storage-facilities:v1",
  fuelShortages: "energy:fuel-shortages:v1",
  climateNews: "climate:news-intelligence:v1",
  crossSourceSignals: "intelligence:cross-source-signals:v1",
  socialVelocity: "intelligence:social:reddit:v1",
  ddosAttacks: "cf:radar:ddos:v1",
  trafficAnomalies: "cf:radar:traffic-anomalies:v1",
  diseaseOutbreaks: "health:disease-outbreaks:v1",
  fearGreedIndex: "market:fear-greed:v1",
  breadthHistory: "market:breadth-history:v1",
  cotPositioning: "market:cot:v1",
  aaiiSentiment: "market:aaii-sentiment:v1",
  earningsCalendar: "market:earnings-calendar:v1",
  econCalendar: "economic:econ-calendar:v1",
  energyCrisisPolicies: "energy:crisis-policies:v1",
  faoFoodPriceIndex: "economic:fao-ffpi:v1",
  yieldCurveEu: "economic:yield-curve-eu:v1"
};
var SLOW_KEYS = /* @__PURE__ */ new Set([
  "bisPolicy",
  "bisExchange",
  "bisCredit",
  "minerals",
  "giving",
  "sectors",
  "progressData",
  "renewableEnergy",
  "etfFlows",
  "wildfires",
  "climateAnomalies",
  "sanctionsPressure",
  "radiationWatch",
  "thermalEscalation",
  "cyberThreats",
  "techReadiness",
  "naturalEvents",
  "cryptoQuotes",
  "gulfQuotes",
  "stablecoinMarkets",
  "unrestEvents",
  "ucdpEvents",
  "techEvents",
  "securityAdvisories",
  "customsRevenue",
  "consumerPricesOverview",
  "consumerPricesCategories",
  "consumerPricesMovers",
  "consumerPricesSpread",
  "groceryBasket",
  "bigmac",
  "cryptoSectors",
  "defiTokens",
  "aiTokens",
  "otherTokens",
  "nationalDebt",
  "hfPropagation",
  "pipelinesGas",
  "pipelinesOil",
  "storageFacilities",
  "fuelShortages",
  "climateNews",
  "crossSourceSignals",
  "diseaseOutbreaks",
  "fearGreedIndex",
  "breadthHistory",
  "cotPositioning",
  "aaiiSentiment",
  "earningsCalendar",
  "econCalendar",
  "energyCrisisPolicies",
  "faoFoodPriceIndex",
  "yieldCurveEu"
]);
var FAST_KEYS = /* @__PURE__ */ new Set([
  "shippingRates",
  "theaterPosture",
  "earthquakes",
  "outages",
  "serviceStatuses",
  "macroSignals",
  "chokepoints",
  "chokepointTransits",
  "riskScores",
  "marketQuotes",
  "commodityQuotes",
  "positiveGeoEvents",
  "flightDelays",
  "insights",
  "predictions",
  "iranEvents",
  "temporalAnomalies",
  "weatherAlerts",
  "spending",
  "gdeltIntel",
  "correlationCards",
  "forecasts",
  "localAdsb",
  "acars",
  "socialVelocity",
  "ddosAttacks",
  "trafficAnomalies"
]);
var TIER_CACHE = {
  slow: "max-age=300, stale-while-revalidate=600, stale-if-error=3600",
  fast: "max-age=60, stale-while-revalidate=120, stale-if-error=900"
};
var TIER_CDN_CACHE = {
  slow: "public, s-maxage=7200, stale-while-revalidate=1800, stale-if-error=7200",
  fast: "public, s-maxage=600, stale-while-revalidate=120, stale-if-error=900"
};
var NEG_SENTINEL = "__WM_NEG__";
function unwrapEnvelope(raw) {
  if (raw == null) return { _seed: null, data: null };
  const value = typeof raw === "string" ? (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  })() : raw;
  if (typeof value !== "object" || Array.isArray(value)) return { _seed: null, data: value };
  const seed = value._seed;
  if (seed && typeof seed === "object" && typeof seed.fetchedAt === "number") return { _seed: seed, data: value.data };
  return { _seed: null, data: value };
}
function getCacheBackend() {
  const configuredBackend = (process.env.WM_CACHE_BACKEND || "").trim().toLowerCase();
  if (configuredBackend === "local-file") return "local-file";
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return "upstash";
  return "none";
}
async function localFileGetCachedJsonBatch(keys) {
  const result = /* @__PURE__ */ new Map();
  const cacheFile = (process.env.WM_LOCAL_CACHE_FILE || "").trim();
  if (!cacheFile) return result;
  try {
    const [{ readFile }] = await Promise.all([
      import("node:fs/promises")
    ]);
    const raw = await readFile(cacheFile, "utf-8");
    const store = JSON.parse(raw || "{}");
    const kv = store?.kv && typeof store.kv === "object" ? store.kv : LOCAL_FILE_STORE_EMPTY.kv;
    const now = Date.now();
    for (const key of keys) {
      const entry = kv[key];
      if (!entry || typeof entry.value !== "string") continue;
      if (typeof entry.expiresAt === "number" && entry.expiresAt <= now) continue;
      try {
        const parsed = JSON.parse(entry.value);
        if (parsed !== NEG_SENTINEL) result.set(key, unwrapEnvelope(parsed).data);
      } catch {
      }
    }
  } catch {
    return result;
  }
  return result;
}
async function getCachedJsonBatch(keys) {
  const result = /* @__PURE__ */ new Map();
  if (keys.length === 0) return result;
  const backend = getCacheBackend();
  if (backend === "local-file") {
    return localFileGetCachedJsonBatch(keys);
  }
  if (backend === "none") {
    return result;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return result;
  const pipeline = keys.map((k) => ["GET", k]);
  const resp = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(pipeline),
    signal: AbortSignal.timeout(3e3)
  });
  if (!resp.ok) return result;
  const data = await resp.json();
  for (let i = 0; i < keys.length; i++) {
    const raw = data[i]?.result;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed !== NEG_SENTINEL) result.set(keys[i], unwrapEnvelope(parsed).data);
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
  const url = new URL(req.url);
  const tier = url.searchParams.get("tier");
  let registry;
  if (tier === "slow" || tier === "fast") {
    const tierSet = tier === "slow" ? SLOW_KEYS : FAST_KEYS;
    registry = Object.fromEntries(Object.entries(BOOTSTRAP_CACHE_KEYS).filter(([k]) => tierSet.has(k)));
  } else {
    const requested = url.searchParams.get("keys")?.split(",").filter(Boolean).sort();
    registry = requested ? Object.fromEntries(Object.entries(BOOTSTRAP_CACHE_KEYS).filter(([k]) => requested.includes(k))) : BOOTSTRAP_CACHE_KEYS;
  }
  const keys = Object.values(registry);
  const names = Object.keys(registry);
  let cached;
  try {
    cached = await getCachedJsonBatch(keys);
  } catch {
    return jsonResponse({ data: {}, missing: names }, 200, { ...cors, "Cache-Control": "no-cache" });
  }
  const data = {};
  const missing = [];
  for (let i = 0; i < names.length; i++) {
    const val = cached.get(keys[i]);
    if (val !== void 0) {
      if (names[i] === "forecasts" && val != null && "enrichmentMeta" in val) {
        const { enrichmentMeta: _stripped, ...rest } = val;
        data[names[i]] = rest;
      } else {
        data[names[i]] = val;
      }
    } else {
      missing.push(names[i]);
    }
  }
  const cacheControl = tier && TIER_CACHE[tier] || "public, s-maxage=600, stale-while-revalidate=120, stale-if-error=900";
  return jsonResponse({ data, missing }, 200, {
    ...getPublicCorsHeaders(),
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": tier && TIER_CDN_CACHE[tier] || TIER_CDN_CACHE.fast
  });
}
var bootstrap_default = withEdgeObservability("/api/bootstrap", handler);
export {
  config,
  bootstrap_default as default
};
