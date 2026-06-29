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

// api/reverse-geocode.js
var config = { runtime: "edge" };
var NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";
var CHROME_UA = "WorldMonitor/2.0 (https://wm.opsio.space)";
async function handler(req) {
  if (isDisallowedOrigin(req))
    return new Response("Forbidden", { status: 403 });
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  const latN = Number(lat);
  const lonN = Number(lon);
  if (!lat || !lon || Number.isNaN(latN) || Number.isNaN(lonN) || latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
    return jsonResponse({ error: "valid lat (-90..90) and lon (-180..180) required" }, 400, cors);
  }
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const cacheKey = `geocode:${latN.toFixed(1)},${lonN.toFixed(1)}`;
  if (redisUrl && redisToken) {
    try {
      const cached = await fetch(`${redisUrl}/get/${encodeURIComponent(cacheKey)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        signal: AbortSignal.timeout(1500)
      });
      if (cached.ok) {
        const data = await cached.json();
        if (data.result) {
          return new Response(data.result, {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "application/json",
              "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600"
            }
          });
        }
      }
    } catch {
    }
  }
  try {
    const resp = await fetch(
      `${NOMINATIM_BASE}?lat=${latN}&lon=${lonN}&format=json&zoom=3&accept-language=en`,
      {
        headers: { "User-Agent": CHROME_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8e3)
      }
    );
    if (!resp.ok) {
      return jsonResponse({ error: `Nominatim ${resp.status}` }, 502, cors);
    }
    const data = await resp.json();
    const country = data.address?.country;
    const code = data.address?.country_code?.toUpperCase();
    const result = { country: country || null, code: code || null, displayName: data.display_name || country || "" };
    const body = JSON.stringify(result);
    if (redisUrl && redisToken && country && code) {
      fetch(redisUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(["SET", cacheKey, body, "EX", 604800])
      }).catch(() => {
      });
    }
    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600"
      }
    });
  } catch (err) {
    return jsonResponse({ error: "Nominatim request failed" }, 502, cors);
  }
}
var reverse_geocode_default = withEdgeObservability("/api/reverse-geocode", handler);
export {
  config,
  reverse_geocode_default as default
};
