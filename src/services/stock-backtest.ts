import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  ApiError,
  MarketServiceClient,
  type BacktestStockResponse,
} from '@/generated/client/worldmonitor/market/v1/service_client';
import { PremiumStockUnavailableError } from './stock-analysis';

const client = new MarketServiceClient(getRpcBaseUrl(), {
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
});

export type StockBacktestResult = BacktestStockResponse;

const DEFAULT_LIMIT = 4;
const DEFAULT_EVAL_WINDOW_DAYS = 10;
export const STOCK_BACKTEST_FRESH_MS = 24 * 60 * 60 * 1000;

async function getTargets(limit: number) {
  const { getStockAnalysisTargets } = await import('./stock-analysis');
  return getStockAnalysisTargets(limit);
}

export async function fetchStockBacktestsForTargets(
  targets: Array<{ symbol: string; name: string }>,
  evalWindowDays = DEFAULT_EVAL_WINDOW_DAYS,
): Promise<StockBacktestResult[]> {
  const results: StockBacktestResult[] = [];
  const failures: Error[] = [];
  const unavailableMessages: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const result = await client.backtestStock({
        symbol: targets[i]!.symbol,
        name: targets[i]!.name,
        evalWindowDays,
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

export async function fetchStockBacktests(
  limit = DEFAULT_LIMIT,
  evalWindowDays = DEFAULT_EVAL_WINDOW_DAYS,
): Promise<StockBacktestResult[]> {
  return fetchStockBacktestsForTargets(await getTargets(limit), evalWindowDays);
}

export async function fetchStoredStockBacktests(
  limit = DEFAULT_LIMIT,
  evalWindowDays = DEFAULT_EVAL_WINDOW_DAYS,
): Promise<StockBacktestResult[]> {
  const targets = await getTargets(limit);
  const symbols = targets.map((target) => target.symbol);
  const response = await client.listStoredStockBacktests({
    symbols,
    evalWindowDays,
  });
  return response.items.filter((result) => result.available);
}

export function hasFreshStoredStockBacktests(
  items: StockBacktestResult[],
  symbols: string[],
  maxAgeMs = STOCK_BACKTEST_FRESH_MS,
): boolean {
  if (symbols.length === 0) return false;
  const bySymbol = new Map(items.map((item) => [item.symbol, item]));
  const now = Date.now();
  return symbols.every((symbol) => {
    const item = bySymbol.get(symbol);
    const ts = Date.parse(item?.generatedAt || '');
    return !!item?.available && Number.isFinite(ts) && (now - ts) <= maxAgeMs;
  });
}

export function getMissingOrStaleStoredStockBacktests(
  items: StockBacktestResult[],
  symbols: string[],
  maxAgeMs = STOCK_BACKTEST_FRESH_MS,
): string[] {
  const bySymbol = new Map(items.map((item) => [item.symbol, item]));
  const now = Date.now();
  return symbols.filter((symbol) => {
    const item = bySymbol.get(symbol);
    const ts = Date.parse(item?.generatedAt || '');
    return !(item?.available && Number.isFinite(ts) && (now - ts) <= maxAgeMs);
  });
}
