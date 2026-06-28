import type {
  ServerContext,
  ListEarningsCalendarRequest,
  ListEarningsCalendarResponse,
  EarningsEntry,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:earnings-calendar:v1';

const EMPTY: ListEarningsCalendarResponse = {
  earnings: [], fromDate: '', toDate: '', total: 0, unavailable: true,
};

function toNullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listEarningsCalendar(
  _ctx: ServerContext,
  req: ListEarningsCalendarRequest,
): Promise<ListEarningsCalendarResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;

    let earnings: EarningsEntry[] = (Array.isArray(raw.earnings) ? raw.earnings : []).map(
      (e: unknown) => {
        const r = e as Record<string, unknown>;
        return {
          symbol: String(r.symbol ?? ''),
          company: String(r.company ?? ''),
          date: String(r.date ?? ''),
          hour: String(r.hour ?? ''),
          epsEstimate: toNullableNum(r.epsEstimate ?? r.eps_estimate),
          revenueEstimate: toNullableNum(r.revenueEstimate ?? r.revenue_estimate),
          epsActual: toNullableNum(r.epsActual ?? r.eps_actual),
          revenueActual: toNullableNum(r.revenueActual ?? r.revenue_actual),
          hasActuals: Boolean(r.hasActuals ?? r.has_actuals),
          surpriseDirection: String(r.surpriseDirection ?? r.surprise_direction ?? ''),
        };
      },
    );

    if (req.fromDate) earnings = earnings.filter(e => e.date >= req.fromDate);
    if (req.toDate) earnings = earnings.filter(e => e.date <= req.toDate);

    return {
      earnings,
      fromDate: req.fromDate || String(raw.fromDate ?? raw.from_date ?? ''),
      toDate: req.toDate || String(raw.toDate ?? raw.to_date ?? ''),
      total: earnings.length,
      unavailable: false,
    };
  } catch {
    return EMPTY;
  }
}
