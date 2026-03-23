import { MARKET_SYMBOLS } from '@/config/markets';
import {
  ApiError,
  MarketServiceClient,
  type AnalyzeStockResponse,
} from '@/generated/client/worldmonitor/market/v1/service_client';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';
import { getRpcBaseUrl } from '@/services/rpc-client';

const client = new MarketServiceClient(getRpcBaseUrl(), {
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
});

export type StockAnalysisResult = AnalyzeStockResponse;

export class PremiumStockUnavailableError extends Error {
  kind: 'config' | 'unavailable';

  constructor(message: string, kind: 'config' | 'unavailable' = 'unavailable') {
    super(message);
    this.name = 'PremiumStockUnavailableError';
    this.kind = kind;
  }
}

export interface StockAnalysisTarget {
  symbol: string;
  name: string;
  display: string;
}

const DEFAULT_LIMIT = 4;

function isAnalyzableSymbol(symbol: string): boolean {
  return !symbol.startsWith('^') && !symbol.includes('=');
}

export function getStockAnalysisTargets(limit = DEFAULT_LIMIT): StockAnalysisTarget[] {
  const seen = new Set<string>();
  const targets: StockAnalysisTarget[] = [];
  const customEntries = getMarketWatchlistEntries()
    .filter((entry) => isAnalyzableSymbol(entry.symbol))
    .map((entry) => ({
      symbol: entry.symbol,
      name: entry.name || entry.symbol,
      display: entry.display || entry.symbol,
    }));
  const defaultEntries = MARKET_SYMBOLS.filter((entry) => isAnalyzableSymbol(entry.symbol));

  for (const entry of [...customEntries, ...defaultEntries]) {
    if (seen.has(entry.symbol)) continue;
    seen.add(entry.symbol);
    targets.push({ symbol: entry.symbol, name: entry.name, display: entry.display });
    if (targets.length >= limit) break;
  }
  return targets;
}

export async function fetchStockAnalysesForTargets(targets: StockAnalysisTarget[]): Promise<StockAnalysisResult[]> {
  const results: StockAnalysisResult[] = [];
  const failures: Error[] = [];
  const unavailableMessages: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const result = await client.analyzeStock({
        symbol: targets[i]!.symbol,
        name: targets[i]!.name,
        includeNews: true,
      });
      if (result.available) {
        results.push(result);
      } else if (result.summary) {
        unavailableMessages.push(result.summary);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (results.length === 0 && failures.length > 0) {
    const authFailure = failures.find((error) => error instanceof ApiError && error.statusCode === 401);
    throw authFailure || failures[0];
  }
  if (results.length === 0 && unavailableMessages.length > 0) {
    const message = unavailableMessages[0]!;
    const isConfigError = /WS_RELAY_URL|FINNHUB_API_KEY/.test(message);
    throw new PremiumStockUnavailableError(message, isConfigError ? 'config' : 'unavailable');
  }
  return results;
}

export async function fetchStockAnalyses(limit = DEFAULT_LIMIT): Promise<StockAnalysisResult[]> {
  return fetchStockAnalysesForTargets(getStockAnalysisTargets(limit));
}
