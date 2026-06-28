import type {
  ServerContext,
  GetMarketBreadthHistoryRequest,
  GetMarketBreadthHistoryResponse,
  BreadthSnapshot,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:breadth-history:v1';

const EMPTY: GetMarketBreadthHistoryResponse = {
  currentPctAbove20d: null,
  currentPctAbove50d: null,
  currentPctAbove200d: null,
  updatedAt: '',
  history: [],
  unavailable: true,
};

function toNullable(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getMarketBreadthHistory(
  _ctx: ServerContext,
  _req: GetMarketBreadthHistoryRequest,
): Promise<GetMarketBreadthHistoryResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;

    const current = raw.current as Record<string, unknown> | undefined;
    const history: BreadthSnapshot[] = (Array.isArray(raw.history) ? raw.history : []).map(
      (e: unknown) => {
        const entry = e as Record<string, unknown>;
        return {
          date: String(entry.date ?? ''),
          pctAbove20d: toNullable(entry.pctAbove20d ?? entry.pct_above_20d),
          pctAbove50d: toNullable(entry.pctAbove50d ?? entry.pct_above_50d),
          pctAbove200d: toNullable(entry.pctAbove200d ?? entry.pct_above_200d),
        };
      },
    );

    return {
      currentPctAbove20d: toNullable(raw.currentPctAbove20d ?? raw.current_pct_above_20d ?? current?.pctAbove20d),
      currentPctAbove50d: toNullable(raw.currentPctAbove50d ?? raw.current_pct_above_50d ?? current?.pctAbove50d),
      currentPctAbove200d: toNullable(raw.currentPctAbove200d ?? raw.current_pct_above_200d ?? current?.pctAbove200d),
      updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
      history,
      unavailable: false,
    };
  } catch {
    return EMPTY;
  }
}
