#!/usr/bin/env node

import { loadEnvFile, loadSharedConfig, CHROME_UA, runSeed, sleep } from './_seed-utils.mjs';

const cryptoConfig = loadSharedConfig('crypto.json');

loadEnvFile(import.meta.url);

const CANONICAL_KEY = 'market:crypto:v1';
const CACHE_TTL = 3600; // 1 hour

const CRYPTO_IDS = cryptoConfig.ids;
const CRYPTO_META = cryptoConfig.meta;

async function fetchWithRateLimitRetry(url, maxAttempts = 5, headers = { Accept: 'application/json', 'User-Agent': CHROME_UA }) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.status === 429) {
      const wait = Math.min(10_000 * (i + 1), 60_000);
      console.warn(`  CoinGecko 429 — waiting ${wait / 1000}s (attempt ${i + 1}/${maxAttempts})`);
      await sleep(wait);
      continue;
    }
    if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}`);
    return resp;
  }
  throw new Error('CoinGecko rate limit exceeded after retries');
}

const COINPAPRIKA_ID_MAP = cryptoConfig.coinpaprika;

async function fetchFromCoinGecko() {
  const ids = CRYPTO_IDS.join(',');
  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = apiKey
    ? 'https://pro-api.coingecko.com/api/v3'
    : 'https://api.coingecko.com/api/v3';
  const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
  const headers = { Accept: 'application/json', 'User-Agent': CHROME_UA };
  if (apiKey) headers['x-cg-pro-api-key'] = apiKey;

  const resp = await fetchWithRateLimitRetry(url, 5, headers);
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('CoinGecko returned no data');
  }
  return data;
}

async function fetchFromCoinPaprika() {
  console.log('  [CoinPaprika] Falling back to CoinPaprika...');
  const resp = await fetch('https://api.coinpaprika.com/v1/tickers?quotes=USD', {
    headers: { Accept: 'application/json', 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`CoinPaprika HTTP ${resp.status}`);
  const allTickers = await resp.json();
  const paprikaIds = new Set(CRYPTO_IDS.map((id) => COINPAPRIKA_ID_MAP[id]).filter(Boolean));
  const reverseMap = new Map(Object.entries(COINPAPRIKA_ID_MAP).map(([g, p]) => [p, g]));
  return allTickers
    .filter((t) => paprikaIds.has(t.id))
    .map((t) => ({
      id: reverseMap.get(t.id) || t.id,
      current_price: t.quotes.USD.price,
      price_change_percentage_24h: t.quotes.USD.percent_change_24h,
      sparkline_in_7d: undefined,
      symbol: t.symbol.toLowerCase(),
      name: t.name,
    }));
}

const PYTH_HERMES_IDS = {
  'bitcoin': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ethereum': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'binancecoin': '2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  'solana': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'ripple': 'ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8',
  'cardano': '2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d',
  'dogecoin': 'dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  'tron': '67aed5a24fdad045475e7195c98a98aea119c763f272d4523f5bac93a4f33c2b',
  'avalanche-2': '93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'chainlink': '8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
};

async function fetchFromPythHermes() {
  console.log('  [Pyth Hermes] Falling back to Pyth Hermes...');
  const ids = Object.values(PYTH_HERMES_IDS);
  const params = ids.map(id => `ids[]=${id}`).join('&');
  const resp = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params}&parsed=true`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Pyth Hermes HTTP ${resp.status}`);
  const body = await resp.json();
  const parsed = body.parsed || [];
  const reverseMap = Object.fromEntries(Object.entries(PYTH_HERMES_IDS).map(([k, v]) => [v, k]));
  return parsed.map(p => {
    const geckoId = reverseMap[p.id];
    if (!geckoId) return null;
    const price = Number(p.price.price) * 10 ** Number(p.price.expo);
    return {
      id: geckoId,
      current_price: price,
      price_change_percentage_24h: 0,
      sparkline_in_7d: undefined,
      symbol: (CRYPTO_META[geckoId]?.symbol || geckoId).toLowerCase(),
      name: CRYPTO_META[geckoId]?.name || geckoId,
    };
  }).filter(Boolean);
}

async function fetchCryptoQuotes() {
  let data;
  try {
    data = await fetchFromCoinGecko();
  } catch (err) {
    console.warn(`  [CoinGecko] Failed: ${err.message}`);
    try {
      data = await fetchFromCoinPaprika();
    } catch (err2) {
      console.warn(`  [CoinPaprika] Failed: ${err2.message}`);
      data = await fetchFromPythHermes();
    }
  }

  const byId = new Map(data.map((c) => [c.id, c]));
  const quotes = [];

  for (const id of CRYPTO_IDS) {
    const coin = byId.get(id);
    if (!coin) continue;
    const meta = CRYPTO_META[id];
    const prices = coin.sparkline_in_7d?.price;
    const sparkline = prices && prices.length > 24 ? prices.slice(-48) : (prices || []);

    quotes.push({
      name: meta?.name || id,
      symbol: meta?.symbol || id.toUpperCase(),
      price: coin.current_price ?? 0,
      change: coin.price_change_percentage_24h ?? 0,
      sparkline,
    });
  }

  if (quotes.every((q) => q.price === 0)) {
    throw new Error('All sources returned all-zero prices');
  }

  return { quotes };
}

function validate(data) {
  return (
    Array.isArray(data?.quotes) &&
    data.quotes.length >= 1 &&
    data.quotes.some((q) => q.price > 0)
  );
}

runSeed('market', 'crypto', CANONICAL_KEY, fetchCryptoQuotes, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'coingecko-markets',
}).catch((err) => {
  const _cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : ''; console.error('FATAL:', (err.message || err) + _cause);
  process.exit(1);
});
