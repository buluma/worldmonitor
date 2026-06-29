import type {
  ServerContext,
  GetFearGreedIndexRequest,
  GetFearGreedIndexResponse,
  FearGreedCategory,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:fear-greed:v1';

const EMPTY: GetFearGreedIndexResponse = {
  compositeScore: 0, compositeLabel: '', previousScore: 0, seededAt: '',
  vix: 0, hySpread: 0, yield10y: 0, putCallRatio: 0, pctAbove200d: 0,
  cnnFearGreed: 0, cnnLabel: '', aaiiBull: 0, aaiiBear: 0, fedRate: '',
  unavailable: true, fsiValue: 0, fsiLabel: '', hygPrice: 0, tltPrice: 0,
  sectorPerformance: [],
};

function toCategory(raw: unknown): FearGreedCategory | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    score: Number(r.score ?? 0),
    weight: Number(r.weight ?? 0),
    contribution: Number(r.contribution ?? 0),
    degraded: Boolean(r.degraded),
    inputsJson: String(r.inputsJson ?? r.inputs_json ?? ''),
  };
}

export async function getFearGreedIndex(
  _ctx: ServerContext,
  _req: GetFearGreedIndexRequest,
): Promise<GetFearGreedIndexResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;
    return {
      compositeScore: Number(raw.compositeScore ?? 0),
      compositeLabel: String(raw.compositeLabel ?? ''),
      previousScore: Number(raw.previousScore ?? 0),
      seededAt: String(raw.seededAt ?? ''),
      sentiment: toCategory(raw.sentiment),
      volatility: toCategory(raw.volatility),
      positioning: toCategory(raw.positioning),
      trend: toCategory(raw.trend),
      breadth: toCategory(raw.breadth),
      momentum: toCategory(raw.momentum),
      liquidity: toCategory(raw.liquidity),
      credit: toCategory(raw.credit),
      macro: toCategory(raw.macro),
      crossAsset: toCategory(raw.crossAsset ?? raw.cross_asset),
      vix: Number(raw.vix ?? 0),
      hySpread: Number(raw.hySpread ?? raw.hy_spread ?? 0),
      yield10y: Number(raw.yield10y ?? raw.yield_10y ?? 0),
      putCallRatio: Number(raw.putCallRatio ?? raw.put_call_ratio ?? 0),
      pctAbove200d: Number(raw.pctAbove200d ?? raw.pct_above_200d ?? 0),
      cnnFearGreed: Number(raw.cnnFearGreed ?? raw.cnn_fear_greed ?? 0),
      cnnLabel: String(raw.cnnLabel ?? raw.cnn_label ?? ''),
      aaiiBull: Number(raw.aaiiBull ?? raw.aaii_bull ?? 0),
      aaiiBear: Number(raw.aaiiBear ?? raw.aaii_bear ?? 0),
      fedRate: String(raw.fedRate ?? raw.fed_rate ?? ''),
      unavailable: false,
      fsiValue: Number(raw.fsiValue ?? raw.fsi_value ?? 0),
      fsiLabel: String(raw.fsiLabel ?? raw.fsi_label ?? ''),
      hygPrice: Number(raw.hygPrice ?? raw.hyg_price ?? 0),
      tltPrice: Number(raw.tltPrice ?? raw.tlt_price ?? 0),
      sectorPerformance: Array.isArray(raw.sectorPerformance ?? raw.sector_performance)
        ? (raw.sectorPerformance ?? raw.sector_performance as unknown[]).map((s: unknown) => {
            const sp = s as Record<string, unknown>;
            return { symbol: String(sp.symbol ?? ''), name: String(sp.name ?? ''), change1d: Number(sp.change1d ?? sp.change_1d ?? 0) };
          })
        : [],
    };
  } catch {
    return EMPTY;
  }
}
