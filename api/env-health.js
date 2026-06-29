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

// api/env-health.js
var config = { runtime: "edge" };
function boolEnv(name) {
  return !!process.env[name];
}
function stringState(name) {
  return boolEnv(name) ? "configured" : "missing";
}
async function handler(req) {
  if (isDisallowedOrigin(req))
    return new Response("Forbidden", { status: 403 });
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  const apiKeyResult = validateApiKey(req);
  if (apiKeyResult.required && !apiKeyResult.valid)
    return new Response(JSON.stringify({ error: apiKeyResult.error }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  const redisConfigured = boolEnv("UPSTASH_REDIS_REST_URL") && boolEnv("UPSTASH_REDIS_REST_TOKEN");
  const relayConfigured = boolEnv("WS_RELAY_URL");
  const market = {
    redisConfigured,
    relayConfigured,
    liveYahooFallbackEnabled: !(!redisConfigured && !relayConfigured),
    seedFallbackFlags: {
      crypto: boolEnv("SEED_FALLBACK_CRYPTO"),
      etf: boolEnv("SEED_FALLBACK_ETF"),
      gulf: boolEnv("SEED_FALLBACK_GULF"),
      stablecoins: boolEnv("SEED_FALLBACK_STABLECOINS")
    },
    endpoints: {
      commodityQuotes: {
        seedKey: "market:commodities-bootstrap:v1",
        liveYahooMode: !redisConfigured && !relayConfigured ? "disabled" : "enabled"
      },
      etfFlows: {
        seedKey: "market:etf-flows:v1",
        liveYahooMode: !redisConfigured && !relayConfigured ? "disabled" : "enabled"
      },
      gulfQuotes: {
        seedKey: "market:gulf-quotes:v1",
        liveYahooMode: !redisConfigured && !relayConfigured ? "disabled" : "enabled"
      }
    }
  };
  const payload = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    environment: process.env.VERCEL_ENV || "development",
    config: {
      redis: {
        url: stringState("UPSTASH_REDIS_REST_URL"),
        token: stringState("UPSTASH_REDIS_REST_TOKEN")
      },
      relay: {
        wsRelayUrl: stringState("WS_RELAY_URL")
      },
      market,
      providers: {
        coingecko: { apiKey: stringState("COINGECKO_API_KEY") },
        finnhub: { apiKey: stringState("FINNHUB_API_KEY") }
      }
    },
    summary: {
      status: redisConfigured || relayConfigured ? "partial_or_better" : "degraded_local",
      message: !redisConfigured && !relayConfigured ? "Redis seed cache and WS_RELAY_URL are both unavailable; Yahoo-seeded market endpoints degrade early." : "At least one market prerequisite is configured."
    }
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store"
    }
  });
}
var env_health_default = withEdgeObservability("/api/env-health", handler, {
  captureStatusFailures: false
});
export {
  config,
  env_health_default as default
};
