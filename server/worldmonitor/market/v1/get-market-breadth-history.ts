import type {
  ServerContext,
  GetMarketBreadthHistoryRequest,
  GetMarketBreadthHistoryResponse,
  BreadthSnapshot,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_CACHE_KEY = 'market:breadth-history:v1';

interface SeedEntry {
  date: string;
  pctAbove20d: number | null;
  pctAbove50d: number | null;
  pctAbove200d: number | null;
}

interface SeedPayload {
  updatedAt: string;
  current: {
    pctAbove20d: number | null;
    pctAbove50d: number | null;
    pctAbove200d: number | null;
  };
  history: SeedEntry[];
}

function emptyUnavailable(): GetMarketBreadthHistoryResponse {
  return {
    updatedAt: '',
    history: [],
    unavailable: true,
  };
}

function normalize(v: number | null | undefined): number | undefined {
  return v == null ? undefined : v;
}

export async function getMarketBreadthHistory(
  _ctx: ServerContext,
  _req: GetMarketBreadthHistoryRequest,
): Promise<GetMarketBreadthHistoryResponse> {
  try {
    const raw = await getCachedJson(SEED_CACHE_KEY, true) as SeedPayload | null;
    if (!raw?.current || !Array.isArray(raw.history) || raw.history.length === 0) {
      return emptyUnavailable();
    }

    // Preserve missing readings as undefined so a partial seed failure can be
    // distinguished from a real 0% breadth reading in the UI. Panel treats
    // undefined (and null) as "missing".
    const history: BreadthSnapshot[] = raw.history.map((e) => ({
      date: e.date,
      pctAbove20d: normalize(e.pctAbove20d),
      pctAbove50d: normalize(e.pctAbove50d),
      pctAbove200d: normalize(e.pctAbove200d),
    }));

    return {
      currentPctAbove20d: normalize(raw.current.pctAbove20d),
      currentPctAbove50d: normalize(raw.current.pctAbove50d),
      currentPctAbove200d: normalize(raw.current.pctAbove200d),
      updatedAt: raw.updatedAt ?? '',
      history,
      unavailable: false,
    };
  } catch {
    return emptyUnavailable();
  }
}
