import type {
  ServerContext,
  GetCotPositioningRequest,
  GetCotPositioningResponse,
  CotInstrument,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:cot:v1';

const EMPTY: GetCotPositioningResponse = { instruments: [], reportDate: '', unavailable: true };

export async function getCotPositioning(
  _ctx: ServerContext,
  _req: GetCotPositioningRequest,
): Promise<GetCotPositioningResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;

    const instruments: CotInstrument[] = (Array.isArray(raw.instruments) ? raw.instruments : []).map(
      (e: unknown) => {
        const r = e as Record<string, unknown>;
        return {
          name: String(r.name ?? ''),
          code: String(r.code ?? ''),
          reportDate: String(r.reportDate ?? r.report_date ?? ''),
          assetManagerLong: Number(r.assetManagerLong ?? r.asset_manager_long ?? 0),
          assetManagerShort: Number(r.assetManagerShort ?? r.asset_manager_short ?? 0),
          leveragedFundsLong: Number(r.leveragedFundsLong ?? r.leveraged_funds_long ?? 0),
          leveragedFundsShort: Number(r.leveragedFundsShort ?? r.leveraged_funds_short ?? 0),
          dealerLong: Number(r.dealerLong ?? r.dealer_long ?? 0),
          dealerShort: Number(r.dealerShort ?? r.dealer_short ?? 0),
          netPct: Number(r.netPct ?? r.net_pct ?? 0),
        };
      },
    );

    return {
      instruments,
      reportDate: String(raw.reportDate ?? raw.report_date ?? ''),
      unavailable: false,
    };
  } catch {
    return EMPTY;
  }
}
