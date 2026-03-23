import { createRelayHandler } from './_relay.js';

export const config = { runtime: 'edge' };

const OPENSKY_PUBLIC_BASE = 'https://opensky-network.org/api/states/all';

function degradedOpenSkyResponse(corsHeaders, reason, details) {
  return new Response(JSON.stringify({
    time: Date.now(),
    states: [],
    degraded: true,
    error: reason,
    details,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120, stale-if-error=300',
      'X-WorldMonitor-Degraded': 'opensky',
      ...corsHeaders,
    },
  });
}

async function fetchAnonymousOpenSky(req, corsHeaders) {
  try {
    const requestUrl = new URL(req.url);
    const upstreamUrl = `${OPENSKY_PUBLIC_BASE}${requestUrl.search || ''}`;
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; WorldMonitor/1.0; +https://worldmonitor.app)',
      },
      signal: AbortSignal.timeout(12_000),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120, stale-if-error=300',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return degradedOpenSkyResponse(
      corsHeaders,
      isTimeout ? 'OpenSky anonymous timeout' : 'OpenSky anonymous request failed',
      error?.message || String(error),
    );
  }
}

export default createRelayHandler({
  relayPath: '/opensky',
  timeout: 6000,
  onlyOk: true,
  fallback: fetchAnonymousOpenSky,
  cacheHeaders: () => ({
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60, stale-if-error=300',
  }),
  extraHeaders: (response) => {
    const xCache = response.headers.get('x-cache');
    return xCache ? { 'X-Cache': xCache } : {};
  },
});
