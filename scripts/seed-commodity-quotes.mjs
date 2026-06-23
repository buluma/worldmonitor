#!/usr/bin/env node

import { loadEnvFile, loadSharedConfig, CHROME_UA, sleep, runSeed, parseYahooChart, writeExtraKey } from './_seed-utils.mjs';

const commodityConfig = loadSharedConfig('commodities.json');

loadEnvFile(import.meta.url);

const CANONICAL_KEY = 'market:commodities-bootstrap:v1';
const CACHE_TTL = 1800;
const YAHOO_DELAY_MS = 200;

async function fetchYahooWithRetry(url, label, maxAttempts = 4) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.status === 429) {
      const wait = 5000 * (i + 1);
      console.warn(`  [Yahoo] ${label} 429 — waiting ${wait / 1000}s (attempt ${i + 1}/${maxAttempts})`);
      await sleep(wait);
      continue;
    }
    if (!resp.ok) {
      console.warn(`  [Yahoo] ${label} HTTP ${resp.status}`);
      return null;
    }
    return resp;
  }
  console.warn(`  [Yahoo] ${label} rate limited after ${maxAttempts} attempts`);
  return null;
}

const COMMODITY_SYMBOLS = commodityConfig.commodities.map(c => c.symbol);
const COMMODITY_META = Object.fromEntries(commodityConfig.commodities.map(c => [c.symbol, c]));

const PYTH_COMMODITY_IDS = {
  'GC=F':  '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
  'SI=F':  'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
  'HG=F':  '636bedafa14a37791c0898c97804c86ea2c09a1baf1ba00d556afda29e52fc72',
  'PL=F':  '398e4bbc7cbf89d6de2afcdb0bb82d68b6dfb23a0ea78de0f2093c7047d3f3dc',
  'PA=F':  '80367e9664197f37e2d06a3c0c5e3679e13a0e2bca574db15e4e1fa0e2fc0f0a',
  'ALI=F': '2818d3a9c8e0a80b9aa8e6c4ebdd5e7cbc0d42c41cb4ca09e5b4f7c296577e54',
};

async function fetchPythCommodityPrices() {
  const ids = Object.values(PYTH_COMMODITY_IDS);
  if (ids.length === 0) return [];
  const params = ids.map(id => `ids[]=${id}`).join('&');
  const resp = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params}&parsed=true`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Pyth Hermes HTTP ${resp.status}`);
  const body = await resp.json();
  const reverseMap = Object.fromEntries(Object.entries(PYTH_COMMODITY_IDS).map(([k, v]) => [v, k]));
  return (body.parsed || []).map(p => {
    const symbol = reverseMap[p.id];
    if (!symbol) return null;
    const price = Number(p.price.price) * 10 ** Number(p.price.expo);
    const meta = COMMODITY_META[symbol];
    return { symbol, name: meta?.name || symbol, price: Math.round(price * 100) / 100, change: 0 };
  }).filter(Boolean);
}

async function fetchCommodityQuotes() {
  const quotes = [];
  let misses = 0;

  for (let i = 0; i < COMMODITY_SYMBOLS.length; i++) {
    const symbol = COMMODITY_SYMBOLS[i];
    if (i > 0) await sleep(YAHOO_DELAY_MS);

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
      const resp = await fetchYahooWithRetry(url, symbol);
      if (!resp) {
        misses++;
        continue;
      }
      const parsed = parseYahooChart(await resp.json(), symbol);
      if (parsed) {
        quotes.push(parsed);
        console.log(`  ${symbol}: $${parsed.price} (${parsed.change > 0 ? '+' : ''}${parsed.change}%)`);
      } else {
        misses++;
      }
    } catch (err) {
      console.warn(`  [Yahoo] ${symbol} error: ${err.message}`);
      misses++;
    }
  }

  if (quotes.length === 0) {
    console.warn('  [Yahoo] All fetches failed, falling back to Pyth Hermes for metals...');
    try {
      const pythQuotes = await fetchPythCommodityPrices();
      if (pythQuotes.length > 0) {
        console.log(`  [Pyth Hermes] Got ${pythQuotes.length} metal prices`);
        return { quotes: pythQuotes };
      }
    } catch (err) {
      console.warn(`  [Pyth Hermes] Failed: ${err.message}`);
    }
    throw new Error(`All commodity fetches failed (${misses} misses)`);
  }

  return { quotes };
}

function validate(data) {
  return Array.isArray(data?.quotes) && data.quotes.length >= 1;
}

let seedData = null;

async function fetchAndStash() {
  seedData = await fetchCommodityQuotes();
  return seedData;
}

runSeed('market', 'commodities', CANONICAL_KEY, fetchAndStash, {
  validateFn: validate,
  ttlSeconds: CACHE_TTL,
  sourceVersion: 'yahoo-chart',
}).then(async (result) => {
  if (result?.skipped || !seedData) return;
  const commodityKey = `market:commodities:v1:${[...COMMODITY_SYMBOLS].sort().join(',')}`;
  const quotesKey = `market:quotes:v1:${[...COMMODITY_SYMBOLS].sort().join(',')}`;
  const quotesPayload = { ...seedData, finnhubSkipped: false, skipReason: '', rateLimited: false };
  await writeExtraKey(commodityKey, seedData, CACHE_TTL);
  await writeExtraKey(quotesKey, quotesPayload, CACHE_TTL);
}).catch((err) => {
  const _cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : ''; console.error('FATAL:', (err.message || err) + _cause);
  process.exit(1);
});
