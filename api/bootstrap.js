import { getCorsHeaders, getPublicCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { jsonResponse } from './_json-response.js';
import { withEdgeObservability } from './_observability.js';

export const config = { runtime: 'edge' };

const LOCAL_FILE_STORE_EMPTY = { kv: {} };

// @gen-cache-keys:begin
const BOOTSTRAP_CACHE_KEYS = {
  earthquakes: 'seismology:earthquakes:v1',
  outages: 'infra:outages:v1',
  serviceStatuses: 'infra:service-statuses:v1',
  sectors: 'market:sectors:v1',
  etfFlows: 'market:etf-flows:v1',
  macroSignals: 'economic:macro-signals:v1',
  bisPolicy: 'economic:bis:policy:v1',
  bisExchange: 'economic:bis:eer:v1',
  bisCredit: 'economic:bis:credit:v1',
  shippingRates: 'supply_chain:shipping:v2',
  chokepoints: 'supply_chain:chokepoints:v4',
  chokepointTransits: 'supply_chain:chokepoint_transits:v1',
  minerals: 'supply_chain:minerals:v2',
  giving: 'giving:summary:v1',
  climateAnomalies: 'climate:anomalies:v1',
  radiationWatch: 'radiation:observations:v1',
  thermalEscalation: 'thermal:escalation:v1',
  wildfires: 'wildfire:fires:v1',
  marketQuotes: 'market:stocks-bootstrap:v1',
  commodityQuotes: 'market:commodities-bootstrap:v1',
  cyberThreats: 'cyber:threats-bootstrap:v2',
  techReadiness: 'economic:worldbank-techreadiness:v1',
  progressData: 'economic:worldbank-progress:v1',
  renewableEnergy: 'economic:worldbank-renewable:v1',
  positiveGeoEvents: 'positive_events:geo-bootstrap:v1',
  theaterPosture: 'theater_posture:sebuf:stale:v1',
  riskScores: 'risk:scores:sebuf:stale:v1',
  naturalEvents: 'natural:events:v1',
  flightDelays: 'aviation:delays-bootstrap:v1',
  insights: 'news:insights:v1',
  predictions: 'prediction:markets-bootstrap:v1',
  cryptoQuotes: 'market:crypto:v1',
  gulfQuotes: 'market:gulf-quotes:v1',
  stablecoinMarkets: 'market:stablecoins:v1',
  unrestEvents: 'unrest:events:v1',
  iranEvents: 'conflict:iran-events:v1',
  ucdpEvents: 'conflict:ucdp-events:v1',
  temporalAnomalies: 'temporal:anomalies:v1',
  weatherAlerts: 'weather:alerts:v1',
  spending: 'economic:spending:v1',
  techEvents: 'research:tech-events-bootstrap:v1',
  gdeltIntel: 'intelligence:gdelt-intel:v1',
  correlationCards: 'correlation:cards-bootstrap:v1',
  securityAdvisories: 'intelligence:advisories-bootstrap:v1',
  forecasts: 'forecast:predictions:v2',
  customsRevenue: 'trade:customs-revenue:v1',
  sanctionsPressure: 'sanctions:pressure:v1',
  consumerPricesOverview: 'consumer-prices:overview:ae',
  consumerPricesCategories: 'consumer-prices:categories:ae:30d',
  consumerPricesMovers: 'consumer-prices:movers:ae:30d',
  consumerPricesSpread: 'consumer-prices:retailer-spread:ae:essentials-ae',
  groceryBasket: 'economic:grocery-basket:v1',
  bigmac: 'economic:bigmac:v1',
  cryptoSectors: 'market:crypto-sectors:v1',
  defiTokens: 'market:defi-tokens:v1',
  aiTokens: 'market:ai-tokens:v1',
  otherTokens: 'market:other-tokens:v1',
  nationalDebt: 'economic:national-debt:v1',
  hfPropagation: 'rf:propagation:v1',
  localAdsb: 'adsb:local:v1',
  pipelinesGas: 'energy:pipelines:gas:v1',
  pipelinesOil: 'energy:pipelines:oil:v1',
  storageFacilities: 'energy:storage-facilities:v1',
  fuelShortages: 'energy:fuel-shortages:v1',
  climateNews: 'climate:news-intelligence:v1',
  crossSourceSignals: 'intelligence:cross-source-signals:v1',
  socialVelocity: 'intelligence:social:reddit:v1',
  ddosAttacks: 'cf:radar:ddos:v1',
  trafficAnomalies: 'cf:radar:traffic-anomalies:v1',
  diseaseOutbreaks: 'health:disease-outbreaks:v1',
  fearGreedIndex:    'market:fear-greed:v1',
  breadthHistory:    'market:breadth-history:v1',
  cotPositioning:    'market:cot:v1',
  aaiiSentiment:     'market:aaii-sentiment:v1',
  earningsCalendar:  'market:earnings-calendar:v1',
  econCalendar:      'economic:econ-calendar:v1',
  energyCrisisPolicies: 'energy:crisis-policies:v1',
  faoFoodPriceIndex: 'economic:fao-ffpi:v1',
  yieldCurveEu:      'economic:yield-curve-eu:v1',
};

const BOOTSTRAP_TIERS = {
  bisPolicy: 'slow', bisExchange: 'slow', bisCredit: 'slow', minerals: 'slow', giving: 'slow', sectors: 'slow',
  progressData: 'slow', renewableEnergy: 'slow', etfFlows: 'slow', shippingRates: 'fast', wildfires: 'slow',
  climateAnomalies: 'slow', sanctionsPressure: 'slow', radiationWatch: 'slow', thermalEscalation: 'slow',
  cyberThreats: 'slow', techReadiness: 'slow', theaterPosture: 'fast', naturalEvents: 'slow', cryptoQuotes: 'slow',
  gulfQuotes: 'slow', stablecoinMarkets: 'slow', unrestEvents: 'slow', ucdpEvents: 'slow', techEvents: 'slow',
  earthquakes: 'fast', outages: 'fast', serviceStatuses: 'fast', macroSignals: 'fast', chokepoints: 'fast',
  chokepointTransits: 'fast', riskScores: 'fast', marketQuotes: 'fast', commodityQuotes: 'fast',
  positiveGeoEvents: 'fast', flightDelays: 'fast', insights: 'fast', predictions: 'fast', iranEvents: 'fast',
  temporalAnomalies: 'fast', weatherAlerts: 'fast', spending: 'fast', gdeltIntel: 'fast', correlationCards: 'fast',
  securityAdvisories: 'slow', forecasts: 'fast', customsRevenue: 'slow', consumerPricesOverview: 'slow',
  consumerPricesCategories: 'slow', consumerPricesMovers: 'slow', consumerPricesSpread: 'slow', groceryBasket: 'slow',
  bigmac: 'slow', cryptoSectors: 'slow', defiTokens: 'slow', aiTokens: 'slow', otherTokens: 'slow',
  nationalDebt: 'slow', hfPropagation: 'slow', localAdsb: 'fast',
  pipelinesGas: 'slow', pipelinesOil: 'slow', storageFacilities: 'slow', fuelShortages: 'slow',
  climateNews: 'slow', crossSourceSignals: 'slow', socialVelocity: 'fast',
  ddosAttacks: 'fast', trafficAnomalies: 'fast',
  diseaseOutbreaks: 'slow',
  fearGreedIndex: 'slow', breadthHistory: 'slow', cotPositioning: 'slow',
  aaiiSentiment: 'slow', earningsCalendar: 'slow', econCalendar: 'slow',
  energyCrisisPolicies: 'slow', faoFoodPriceIndex: 'slow', yieldCurveEu: 'slow',
};

const SLOW_KEYS = new Set([
  'bisPolicy',
  'bisExchange',
  'bisCredit',
  'minerals',
  'giving',
  'sectors',
  'progressData',
  'renewableEnergy',
  'etfFlows',
  'wildfires',
  'climateAnomalies',
  'sanctionsPressure',
  'radiationWatch',
  'thermalEscalation',
  'cyberThreats',
  'techReadiness',
  'naturalEvents',
  'cryptoQuotes',
  'gulfQuotes',
  'stablecoinMarkets',
  'unrestEvents',
  'ucdpEvents',
  'techEvents',
  'securityAdvisories',
  'customsRevenue',
  'consumerPricesOverview',
  'consumerPricesCategories',
  'consumerPricesMovers',
  'consumerPricesSpread',
  'groceryBasket',
  'bigmac',
  'cryptoSectors',
  'defiTokens',
  'aiTokens',
  'otherTokens',
  'nationalDebt',
  'hfPropagation',
  'pipelinesGas',
  'pipelinesOil',
  'storageFacilities',
  'fuelShortages',
  'climateNews',
  'crossSourceSignals',
  'diseaseOutbreaks',
  'fearGreedIndex',
  'breadthHistory',
  'cotPositioning',
  'aaiiSentiment',
  'earningsCalendar',
  'econCalendar',
  'energyCrisisPolicies',
  'faoFoodPriceIndex',
  'yieldCurveEu',
]);

const FAST_KEYS = new Set([
  'shippingRates',
  'theaterPosture',
  'earthquakes',
  'outages',
  'serviceStatuses',
  'macroSignals',
  'chokepoints',
  'chokepointTransits',
  'riskScores',
  'marketQuotes',
  'commodityQuotes',
  'positiveGeoEvents',
  'flightDelays',
  'insights',
  'predictions',
  'iranEvents',
  'temporalAnomalies',
  'weatherAlerts',
  'spending',
  'gdeltIntel',
  'correlationCards',
  'forecasts',
  'localAdsb',
  'socialVelocity',
  'ddosAttacks',
  'trafficAnomalies',
]);
// @gen-cache-keys:end

// No public/s-maxage: CF (in front of api.worldmonitor.app) ignores Vary: Origin and would
// pin ACAO: wm.opsio.space on cached responses, breaking CORS for preview deployments.
// Vercel CDN caching is handled by TIER_CDN_CACHE via CDN-Cache-Control below.
const TIER_CACHE = {
  slow: 'max-age=300, stale-while-revalidate=600, stale-if-error=3600',
  fast: 'max-age=60, stale-while-revalidate=120, stale-if-error=900',
};
const TIER_CDN_CACHE = {
  slow: 'public, s-maxage=7200, stale-while-revalidate=1800, stale-if-error=7200',
  fast: 'public, s-maxage=600, stale-while-revalidate=120, stale-if-error=900',
};

const NEG_SENTINEL = '__WM_NEG__';

function getCacheBackend() {
  const configuredBackend = (process.env.WM_CACHE_BACKEND || '').trim().toLowerCase();
  if (configuredBackend === 'local-file') return 'local-file';

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return 'upstash';

  return 'none';
}

async function localFileGetCachedJsonBatch(keys) {
  const result = new Map();
  const cacheFile = (process.env.WM_LOCAL_CACHE_FILE || '').trim();
  if (!cacheFile) return result;

  try {
    const [{ readFile }] = await Promise.all([
      import('node:fs/promises'),
    ]);
    const raw = await readFile(cacheFile, 'utf-8');
    const store = JSON.parse(raw || '{}');
    const kv = store?.kv && typeof store.kv === 'object' ? store.kv : LOCAL_FILE_STORE_EMPTY.kv;
    const now = Date.now();

    for (const key of keys) {
      const entry = kv[key];
      if (!entry || typeof entry.value !== 'string') continue;
      if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now) continue;
      try {
        const parsed = JSON.parse(entry.value);
        if (parsed !== NEG_SENTINEL) result.set(key, parsed);
      } catch {
        // Skip malformed entries
      }
    }
  } catch {
    return result;
  }

  return result;
}

async function getCachedJsonBatch(keys) {
  const result = new Map();
  if (keys.length === 0) return result;

  const backend = getCacheBackend();
  if (backend === 'local-file') {
    return localFileGetCachedJsonBatch(keys);
  }
  if (backend === 'none') {
    return result;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return result;

  // Always read unprefixed keys — bootstrap is a read-only consumer of
  // production cache data. Preview/branch deploys don't run handlers that
  // populate prefixed keys, so prefixing would always miss.
  const pipeline = keys.map((k) => ['GET', k]);
  const resp = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline),
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) return result;

  const data = await resp.json();
  for (let i = 0; i < keys.length; i++) {
    const raw = data[i]?.result;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed !== NEG_SENTINEL) result.set(keys[i], parsed);
      } catch { /* skip malformed */ }
    }
  }
  return result;
}

async function handler(req) {
  if (isDisallowedOrigin(req))
    return new Response('Forbidden', { status: 403 });

  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });

  const apiKeyResult = validateApiKey(req);
  if (apiKeyResult.required && !apiKeyResult.valid)
    return jsonResponse({ error: apiKeyResult.error }, 401, cors);

  const url = new URL(req.url);
  const tier = url.searchParams.get('tier');
  let registry;
  if (tier === 'slow' || tier === 'fast') {
    const tierSet = tier === 'slow' ? SLOW_KEYS : FAST_KEYS;
    registry = Object.fromEntries(Object.entries(BOOTSTRAP_CACHE_KEYS).filter(([k]) => tierSet.has(k)));
  } else {
    const requested = url.searchParams.get('keys')?.split(',').filter(Boolean).sort();
    registry = requested
      ? Object.fromEntries(Object.entries(BOOTSTRAP_CACHE_KEYS).filter(([k]) => requested.includes(k)))
      : BOOTSTRAP_CACHE_KEYS;
  }

  const keys = Object.values(registry);
  const names = Object.keys(registry);

  let cached;
  try {
    cached = await getCachedJsonBatch(keys);
  } catch {
    return jsonResponse({ data: {}, missing: names }, 200, { ...cors, 'Cache-Control': 'no-cache' });
  }

  const data = {};
  const missing = [];
  for (let i = 0; i < names.length; i++) {
    const val = cached.get(keys[i]);
    if (val !== undefined) {
      // Strip seed-internal metadata not intended for API clients
      if (names[i] === 'forecasts' && val != null && 'enrichmentMeta' in val) {
        const { enrichmentMeta: _stripped, ...rest } = val;
        data[names[i]] = rest;
      } else {
        data[names[i]] = val;
      }
    } else {
      missing.push(names[i]);
    }
  }

  const cacheControl = (tier && TIER_CACHE[tier]) || 'public, s-maxage=600, stale-while-revalidate=120, stale-if-error=900';

  // Bootstrap data is fully public (world events, market prices, seismic data).
  // Use ACAO: * so CF caches one entry valid for all origins, including Vercel
  // preview deployments. Per-origin ACAO with Vary: Origin causes CF to pin the
  // first origin's ACAO on the cached response, breaking CORS for other origins.
  return jsonResponse({ data, missing }, 200, {
    ...getPublicCorsHeaders(),
    'Cache-Control': cacheControl,
    'CDN-Cache-Control': (tier && TIER_CDN_CACHE[tier]) || TIER_CDN_CACHE.fast,
  });
}

export default withEdgeObservability('/api/bootstrap', handler);
