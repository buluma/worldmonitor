import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { withEdgeObservability } from './_observability.js';

export const config = { runtime: 'edge' };

function boolEnv(name) {
  return !!process.env[name];
}

function stringState(name) {
  return boolEnv(name) ? 'configured' : 'missing';
}

async function handler(req) {
  if (isDisallowedOrigin(req))
    return new Response('Forbidden', { status: 403 });

  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });

  const apiKeyResult = validateApiKey(req);
  if (apiKeyResult.required && !apiKeyResult.valid)
    return new Response(JSON.stringify({ error: apiKeyResult.error }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });

  const redisConfigured = boolEnv('UPSTASH_REDIS_REST_URL') && boolEnv('UPSTASH_REDIS_REST_TOKEN');
  const relayConfigured = boolEnv('WS_RELAY_URL');

  const market = {
    redisConfigured,
    relayConfigured,
    liveYahooFallbackEnabled: !(!redisConfigured && !relayConfigured),
    seedFallbackFlags: {
      crypto: boolEnv('SEED_FALLBACK_CRYPTO'),
      etf: boolEnv('SEED_FALLBACK_ETF'),
      gulf: boolEnv('SEED_FALLBACK_GULF'),
      stablecoins: boolEnv('SEED_FALLBACK_STABLECOINS'),
    },
    endpoints: {
      commodityQuotes: {
        seedKey: 'market:commodities-bootstrap:v1',
        liveYahooMode: !redisConfigured && !relayConfigured ? 'disabled' : 'enabled',
      },
      etfFlows: {
        seedKey: 'market:etf-flows:v1',
        liveYahooMode: !redisConfigured && !relayConfigured ? 'disabled' : 'enabled',
      },
      gulfQuotes: {
        seedKey: 'market:gulf-quotes:v1',
        liveYahooMode: !redisConfigured && !relayConfigured ? 'disabled' : 'enabled',
      },
    },
  };

  const payload = {
    checkedAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'development',
    config: {
      redis: {
        url: stringState('UPSTASH_REDIS_REST_URL'),
        token: stringState('UPSTASH_REDIS_REST_TOKEN'),
      },
      relay: {
        wsRelayUrl: stringState('WS_RELAY_URL'),
      },
      market,
      providers: {
        coingecko: { apiKey: stringState('COINGECKO_API_KEY') },
        finnhub: { apiKey: stringState('FINNHUB_API_KEY') },
      },
    },
    summary: {
      status: redisConfigured || relayConfigured ? 'partial_or_better' : 'degraded_local',
      message: !redisConfigured && !relayConfigured
        ? 'Redis seed cache and WS_RELAY_URL are both unavailable; Yahoo-seeded market endpoints degrade early.'
        : 'At least one market prerequisite is configured.',
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

export default withEdgeObservability('/api/env-health', handler, {
  captureStatusFailures: false,
});
