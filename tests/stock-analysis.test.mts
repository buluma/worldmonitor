import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { analyzeStock, fetchYahooHistory } from '../server/worldmonitor/market/v1/analyze-stock.ts';
import { ApiError, MarketServiceClient } from '../src/generated/client/worldmonitor/market/v1/service_client.ts';
import { PremiumStockUnavailableError, fetchStockAnalysesForTargets, getStockAnalysisTargets } from '../src/services/stock-analysis.ts';

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalFinnhubApiKey = process.env.FINNHUB_API_KEY;
const originalRelayUrl = process.env.WS_RELAY_URL;

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

const mockChartPayload = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          regularMarketPrice: 132,
          previousClose: 131,
        },
        timestamp: Array.from({ length: 80 }, (_, index) => 1_700_000_000 + (index * 86_400)),
        indicators: {
          quote: [
            {
              open: Array.from({ length: 80 }, (_, index) => 100 + (index * 0.4)),
              high: Array.from({ length: 80 }, (_, index) => 101 + (index * 0.4)),
              low: Array.from({ length: 80 }, (_, index) => 99 + (index * 0.4)),
              close: Array.from({ length: 80 }, (_, index) => 100 + (index * 0.4)),
              volume: Array.from({ length: 80 }, (_, index) => 1_000_000 + (index * 5_000)),
            },
          ],
        },
      },
    ],
  },
};

const mockNewsXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss>
  <channel>
    <item>
      <title>Apple expands AI chip roadmap</title>
      <link>https://example.com/apple-ai</link>
      <pubDate>Sat, 08 Mar 2026 10:00:00 GMT</pubDate>
      <source>Reuters</source>
    </item>
    <item>
      <title>Apple services growth remains resilient</title>
      <link>https://example.com/apple-services</link>
      <pubDate>Sat, 08 Mar 2026 09:00:00 GMT</pubDate>
      <source>Bloomberg</source>
    </item>
  </channel>
</rss>`;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) globalThis.localStorage = originalLocalStorage;
  else delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  if (originalFinnhubApiKey == null) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = originalFinnhubApiKey;
  if (originalRelayUrl == null) delete process.env.WS_RELAY_URL;
  else process.env.WS_RELAY_URL = originalRelayUrl;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OLLAMA_API_URL;
  delete process.env.OLLAMA_MODEL;
});

describe('analyzeStock handler', () => {
  it('builds a structured fallback report from Yahoo history and RSS headlines', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('query1.finance.yahoo.com')) {
        return new Response(JSON.stringify(mockChartPayload), { status: 200 });
      }
      if (url.includes('news.google.com')) {
        return new Response(mockNewsXml, { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const response = await analyzeStock({} as never, {
      symbol: 'AAPL',
      name: 'Apple',
      includeNews: true,
    });

    assert.equal(response.available, true);
    assert.equal(response.symbol, 'AAPL');
    assert.equal(response.name, 'Apple');
    assert.equal(response.currency, 'USD');
    assert.ok(response.signal.length > 0);
    assert.ok(response.signalScore > 0);
    assert.equal(response.provider, 'rules');
    assert.equal(response.fallback, true);
    assert.equal(response.newsSearched, true);
    assert.match(response.analysisId, /^stock:/);
    assert.ok(response.analysisAt > 0);
    assert.ok(response.stopLoss > 0);
    assert.ok(response.takeProfit > 0);
    assert.equal(response.headlines.length, 2);
    assert.match(response.summary, /apple/i);
    assert.ok(response.bullishFactors.length > 0);
  });
});

describe('MarketServiceClient analyzeStock', () => {
  it('serializes the analyze-stock query parameters using generated names', async () => {
    let requestedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ available: false }), { status: 200 });
    }) as typeof fetch;

    const client = new MarketServiceClient('');
    await client.analyzeStock({ symbol: 'MSFT', name: 'Microsoft', includeNews: true });

    assert.match(requestedUrl, /\/api\/market\/v1\/analyze-stock\?/);
    assert.match(requestedUrl, /symbol=MSFT/);
    assert.match(requestedUrl, /name=Microsoft/);
    assert.match(requestedUrl, /include_news=true/);
  });
});

describe('getStockAnalysisTargets', () => {
  it('keeps the watchlist additive for stock-analysis targets', () => {
    globalThis.localStorage = createLocalStorageMock() as Storage;
    globalThis.localStorage.setItem('wm-market-watchlist-v1', JSON.stringify([
      { symbol: '^GSPC', name: 'S&P 500', display: 'SPX' },
      { symbol: 'TSLA', name: 'Tesla', display: 'TSLA' },
    ]));

    const targets = getStockAnalysisTargets(4);

    assert.deepEqual(targets.map((target) => target.symbol), ['TSLA', 'AAPL', 'MSFT', 'NVDA']);
  });
});

describe('fetchStockAnalysesForTargets', () => {
  it('surfaces auth failures when every stock-analysis request is rejected', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: 'Missing World Monitor key' }), { status: 401 });
    }) as typeof fetch;

    await assert.rejects(
      () => fetchStockAnalysesForTargets([{ symbol: 'AAPL', name: 'Apple', display: 'AAPL' }]),
      (error: unknown) => error instanceof ApiError && error.statusCode === 401,
    );
  });

  it('surfaces missing fallback configuration when the backend reports it', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        available: false,
        summary: 'Stock history needs WS_RELAY_URL or FINNHUB_API_KEY.',
      }), { status: 200 });
    }) as typeof fetch;

    await assert.rejects(
      () => fetchStockAnalysesForTargets([{ symbol: 'AAPL', name: 'Apple', display: 'AAPL' }]),
      (error: unknown) => error instanceof PremiumStockUnavailableError
        && error.kind === 'config'
        && /WS_RELAY_URL|FINNHUB_API_KEY/.test(error.message),
    );
  });
});

describe('fetchYahooHistory', () => {
  it('falls back to Finnhub candles when Yahoo chart history is throttled', async () => {
    process.env.FINNHUB_API_KEY = 'test-finnhub-key';
    delete process.env.WS_RELAY_URL;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('query1.finance.yahoo.com')) {
        return new Response('Too Many Requests', { status: 429 });
      }
      if (url.includes('finnhub.io/api/v1/stock/candle')) {
        return new Response(JSON.stringify({
          s: 'ok',
          t: Array.from({ length: 80 }, (_, index) => 1_700_000_000 + (index * 86_400)),
          o: Array.from({ length: 80 }, (_, index) => 100 + (index * 0.4)),
          h: Array.from({ length: 80 }, (_, index) => 101 + (index * 0.4)),
          l: Array.from({ length: 80 }, (_, index) => 99 + (index * 0.4)),
          c: Array.from({ length: 80 }, (_, index) => 100 + (index * 0.4)),
          v: Array.from({ length: 80 }, (_, index) => 1_000_000 + (index * 5_000)),
        }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const history = await fetchYahooHistory('AAPL');

    assert.ok(history);
    assert.equal(history?.currency, 'USD');
    assert.equal(history?.candles.length, 80);
  });
});
