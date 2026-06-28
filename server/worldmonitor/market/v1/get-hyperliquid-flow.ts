import type {
  ServerContext,
  GetHyperliquidFlowRequest,
  GetHyperliquidFlowResponse,
  HyperliquidAssetFlow,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:hyperliquid-flow:v1';

const EMPTY: GetHyperliquidFlowResponse = {
  ts: 0, fetchedAt: '', warmup: false, assetCount: 0, assets: [], unavailable: true,
};

export async function getHyperliquidFlow(
  _ctx: ServerContext,
  _req: GetHyperliquidFlowRequest,
): Promise<GetHyperliquidFlowResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;

    const assets: HyperliquidAssetFlow[] = (Array.isArray(raw.assets) ? raw.assets : []).map(
      (e: unknown) => {
        const r = e as Record<string, unknown>;
        return {
          symbol: String(r.symbol ?? ''),
          display: String(r.display ?? ''),
          assetClass: String(r.assetClass ?? r.asset_class ?? ''),
          group: String(r.group ?? ''),
          funding: String(r.funding ?? ''),
          openInterest: String(r.openInterest ?? r.open_interest ?? ''),
          markPx: String(r.markPx ?? r.mark_px ?? ''),
          oraclePx: String(r.oraclePx ?? r.oracle_px ?? ''),
          dayNotional: String(r.dayNotional ?? r.day_notional ?? ''),
          fundingScore: Number(r.fundingScore ?? r.funding_score ?? 0),
          volumeScore: Number(r.volumeScore ?? r.volume_score ?? 0),
          oiScore: Number(r.oiScore ?? r.oi_score ?? 0),
          basisScore: Number(r.basisScore ?? r.basis_score ?? 0),
          composite: Number(r.composite ?? 0),
          sparkFunding: Array.isArray(r.sparkFunding ?? r.spark_funding) ? (r.sparkFunding ?? r.spark_funding) as number[] : [],
          sparkOi: Array.isArray(r.sparkOi ?? r.spark_oi) ? (r.sparkOi ?? r.spark_oi) as number[] : [],
          sparkScore: Array.isArray(r.sparkScore ?? r.spark_score) ? (r.sparkScore ?? r.spark_score) as number[] : [],
          warmup: Boolean(r.warmup),
          stale: Boolean(r.stale),
          staleSince: Number(r.staleSince ?? r.stale_since ?? 0),
          missingPolls: Number(r.missingPolls ?? r.missing_polls ?? 0),
          alerts: Array.isArray(r.alerts) ? r.alerts as string[] : [],
        };
      },
    );

    return {
      ts: Number(raw.ts ?? 0),
      fetchedAt: String(raw.fetchedAt ?? raw.fetched_at ?? ''),
      warmup: Boolean(raw.warmup),
      assetCount: Number(raw.assetCount ?? raw.asset_count ?? assets.length),
      assets,
      unavailable: false,
    };
  } catch {
    return EMPTY;
  }
}
