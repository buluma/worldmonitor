// api/_github-release.js
var RELEASES_URL = "https://api.github.com/repos/koala73/worldmonitor/releases/latest";
async function fetchLatestRelease(userAgent) {
  const res = await fetch(RELEASES_URL, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": userAgent
    }
  });
  if (!res.ok) return null;
  return res.json();
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

// api/download.js
var config = { runtime: "edge" };
var RELEASES_PAGE = "https://github.com/koala73/worldmonitor/releases/latest";
var PLATFORM_PATTERNS = {
  "windows-exe": (name) => name.endsWith("_x64-setup.exe"),
  "windows-msi": (name) => name.endsWith("_x64_en-US.msi"),
  "macos-arm64": (name) => name.endsWith("_aarch64.dmg"),
  "macos-x64": (name) => name.endsWith("_x64.dmg") && !name.includes("setup"),
  "linux-appimage": (name) => name.endsWith("_amd64.AppImage"),
  "linux-appimage-arm64": (name) => name.endsWith("_aarch64.AppImage")
};
var VARIANT_IDENTIFIERS = {
  full: ["worldmonitor"],
  world: ["worldmonitor"],
  tech: ["techmonitor"],
  finance: ["financemonitor"]
};
function canonicalAssetName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function findAssetForVariant(assets, variant, platformMatcher) {
  const identifiers = VARIANT_IDENTIFIERS[variant] ?? null;
  if (!identifiers) return null;
  return assets.find((asset) => {
    const assetName = String(asset?.name || "");
    const normalizedAssetName = canonicalAssetName(assetName);
    const hasVariantIdentifier = identifiers.some(
      (identifier) => normalizedAssetName.includes(identifier)
    );
    return hasVariantIdentifier && platformMatcher(assetName);
  }) ?? null;
}
async function handler(req) {
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const variant = (url.searchParams.get("variant") || "").toLowerCase();
  if (!platform || !PLATFORM_PATTERNS[platform]) {
    return Response.redirect(RELEASES_PAGE, 302);
  }
  try {
    const release = await fetchLatestRelease("WorldMonitor-Download-Redirect");
    if (!release) {
      return Response.redirect(RELEASES_PAGE, 302);
    }
    const matcher = PLATFORM_PATTERNS[platform];
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = variant ? findAssetForVariant(assets, variant, matcher) : assets.find((a) => matcher(String(a?.name || "")));
    if (!asset) {
      return Response.redirect(RELEASES_PAGE, 302);
    }
    return new Response(null, {
      status: 302,
      headers: {
        "Location": asset.browser_download_url,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60, stale-if-error=600"
      }
    });
  } catch {
    return Response.redirect(RELEASES_PAGE, 302);
  }
}
var download_default = withEdgeObservability("/api/download", handler);
export {
  config,
  download_default as default
};
