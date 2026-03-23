const EDGE_FLUSH_TIMEOUT_MS = 1500;

function cleanEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseSampleRate(rawValue, fallback) {
  const parsed = Number.parseFloat(String(rawValue ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function getEdgeDsn() {
  return cleanEnv(process.env.SENTRY_EDGE_DSN || process.env.SENTRY_DSN);
}

function getGlobalSentry() {
  const sentry = globalThis.Sentry;
  return sentry && typeof sentry === 'object' ? sentry : null;
}

function ensureEdgeSentryInitialized() {
  const sentry = getGlobalSentry();
  if (!sentry || typeof sentry.init !== 'function') return null;

  const dsn = getEdgeDsn();
  sentry.init({
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    release: cleanEnv(process.env.SENTRY_RELEASE) || 'worldmonitor@edge',
    environment:
      cleanEnv(process.env.SENTRY_ENVIRONMENT)
      || cleanEnv(process.env.VERCEL_ENV)
      || cleanEnv(process.env.NODE_ENV)
      || 'development',
    sendDefaultPii: true,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_EDGE_TRACES_SAMPLE_RATE, 0.1),
    initialScope: {
      tags: {
        runtime: 'vercel-edge',
      },
    },
  });

  return sentry;
}

async function captureEdgeFailure(handlerName, request, status, error) {
  const sentry = getGlobalSentry();
  const url = new URL(request.url);

  if (sentry && typeof sentry.withScope === 'function') {
    sentry.withScope((scope) => {
      scope?.setTag?.('handler', handlerName);
      scope?.setTag?.('runtime', 'vercel-edge');
      scope?.setTag?.('http.status_code', String(status));
      scope?.setContext?.('request', {
        method: request.method,
        url: request.url,
        path: url.pathname,
        query: url.search,
      });

      if (error) {
        sentry.captureException?.(error);
        return;
      }

      sentry.captureMessage?.(`Edge handler returned HTTP ${status}: ${handlerName}`, 'error');
    });

    try {
      await sentry.flush?.(EDGE_FLUSH_TIMEOUT_MS);
    } catch {
      // Best-effort flush only.
    }
    return;
  }

  if (error) {
    console.error(`[edge:${handlerName}]`, error);
  } else {
    console.error(`[edge:${handlerName}] HTTP ${status} ${url.pathname}`);
  }
}

export function withEdgeObservability(handlerName, handler, options = {}) {
  const captureStatusFailures = options.captureStatusFailures !== false;
  const captureThrownFailures = options.captureThrownFailures !== false;

  return async function observedHandler(request) {
    const sentry = ensureEdgeSentryInitialized();
    const url = new URL(request.url);

    const runHandler = async () => {
      try {
        const response = await handler(request);
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
          sentryTrace: request.headers.get('sentry-trace'),
          baggage: request.headers.get('baggage'),
        },
        () => sentry.startSpan(
          {
            name: `${request.method} ${url.pathname}`,
            op: 'http.server',
            attributes: {
              'http.request.method': request.method,
              'url.path': url.pathname,
              'wm.handler': handlerName,
            },
          },
          runHandler,
        ),
      );
    }

    return runHandler();
  };
}
