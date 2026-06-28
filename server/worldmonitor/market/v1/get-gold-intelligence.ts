import type {
  ServerContext,
  GetGoldIntelligenceRequest,
  GetGoldIntelligenceResponse,
  GoldCbHolder,
  GoldCbMover,
  GoldDriver,
  GoldCrossCurrencyPrice,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const SEED_KEY = 'market:gold-intelligence:v1';

const EMPTY: GetGoldIntelligenceResponse = {
  goldPrice: 0, goldChangePct: 0, goldSparkline: [],
  silverPrice: 0, platinumPrice: 0, palladiumPrice: 0,
  crossCurrencyPrices: [], updatedAt: '', unavailable: true,
  drivers: [],
};

function toCategory(raw: unknown): { longPositions: number; shortPositions: number; netPct: number; oiSharePct: number; wowNetDelta: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    longPositions: Number(r.longPositions ?? r.long_positions ?? 0),
    shortPositions: Number(r.shortPositions ?? r.short_positions ?? 0),
    netPct: Number(r.netPct ?? r.net_pct ?? 0),
    oiSharePct: Number(r.oiSharePct ?? r.oi_share_pct ?? 0),
    wowNetDelta: Number(r.wowNetDelta ?? r.wow_net_delta ?? 0),
  };
}

export async function getGoldIntelligence(
  _ctx: ServerContext,
  _req: GetGoldIntelligenceRequest,
): Promise<GetGoldIntelligenceResponse> {
  try {
    const raw = await getCachedJson(SEED_KEY, true) as Record<string, unknown> | null;
    if (!raw || raw.unavailable) return EMPTY;

    const crossCurrencyPrices: GoldCrossCurrencyPrice[] = (Array.isArray(raw.crossCurrencyPrices ?? raw.cross_currency_prices)
      ? (raw.crossCurrencyPrices ?? raw.cross_currency_prices) as unknown[]
      : []).map((e: unknown) => {
      const r = e as Record<string, unknown>;
      return { currency: String(r.currency ?? ''), flag: String(r.flag ?? ''), price: Number(r.price ?? 0) };
    });

    const drivers: GoldDriver[] = (Array.isArray(raw.drivers) ? raw.drivers : []).map((e: unknown) => {
      const r = e as Record<string, unknown>;
      return {
        symbol: String(r.symbol ?? ''),
        label: String(r.label ?? ''),
        value: Number(r.value ?? 0),
        changePct: Number(r.changePct ?? r.change_pct ?? 0),
        correlation30d: Number(r.correlation30d ?? r.correlation_30d ?? 0),
      };
    });

    const cotRaw = raw.cot as Record<string, unknown> | undefined;
    const cot = cotRaw ? {
      reportDate: String(cotRaw.reportDate ?? cotRaw.report_date ?? ''),
      nextReleaseDate: String(cotRaw.nextReleaseDate ?? cotRaw.next_release_date ?? ''),
      openInterest: Number(cotRaw.openInterest ?? cotRaw.open_interest ?? 0),
      managedMoney: toCategory(cotRaw.managedMoney ?? cotRaw.managed_money),
      producerSwap: toCategory(cotRaw.producerSwap ?? cotRaw.producer_swap),
    } : undefined;

    const sessRaw = raw.session as Record<string, unknown> | undefined;
    const session = sessRaw ? { dayHigh: Number(sessRaw.dayHigh ?? sessRaw.day_high ?? 0), dayLow: Number(sessRaw.dayLow ?? sessRaw.day_low ?? 0), prevClose: Number(sessRaw.prevClose ?? sessRaw.prev_close ?? 0) } : undefined;

    const retRaw = raw.returns as Record<string, unknown> | undefined;
    const returns = retRaw ? { w1: Number(retRaw.w1 ?? 0), m1: Number(retRaw.m1 ?? 0), ytd: Number(retRaw.ytd ?? 0), y1: Number(retRaw.y1 ?? 0) } : undefined;

    const r52w = raw.range52w as Record<string, unknown> | undefined;
    const range52w = r52w ? { hi: Number(r52w.hi ?? 0), lo: Number(r52w.lo ?? 0), positionPct: Number(r52w.positionPct ?? r52w.position_pct ?? 0) } : undefined;

    const etfRaw = raw.etfFlows ?? raw.etf_flows as Record<string, unknown> | undefined;
    const etfFlows = etfRaw && typeof etfRaw === 'object' ? {
      asOfDate: String((etfRaw as Record<string, unknown>).asOfDate ?? (etfRaw as Record<string, unknown>).as_of_date ?? ''),
      tonnes: Number((etfRaw as Record<string, unknown>).tonnes ?? 0),
      aumUsd: Number((etfRaw as Record<string, unknown>).aumUsd ?? (etfRaw as Record<string, unknown>).aum_usd ?? 0),
      nav: Number((etfRaw as Record<string, unknown>).nav ?? 0),
      changeW1Tonnes: Number((etfRaw as Record<string, unknown>).changeW1Tonnes ?? (etfRaw as Record<string, unknown>).change_w1_tonnes ?? 0),
      changeM1Tonnes: Number((etfRaw as Record<string, unknown>).changeM1Tonnes ?? (etfRaw as Record<string, unknown>).change_m1_tonnes ?? 0),
      changeY1Tonnes: Number((etfRaw as Record<string, unknown>).changeY1Tonnes ?? (etfRaw as Record<string, unknown>).change_y1_tonnes ?? 0),
      changeW1Pct: Number((etfRaw as Record<string, unknown>).changeW1Pct ?? (etfRaw as Record<string, unknown>).change_w1_pct ?? 0),
      changeM1Pct: Number((etfRaw as Record<string, unknown>).changeM1Pct ?? (etfRaw as Record<string, unknown>).change_m1_pct ?? 0),
      changeY1Pct: Number((etfRaw as Record<string, unknown>).changeY1Pct ?? (etfRaw as Record<string, unknown>).change_y1_pct ?? 0),
      sparkline90d: Array.isArray((etfRaw as Record<string, unknown>).sparkline90d ?? (etfRaw as Record<string, unknown>).sparkline_90d) ? ((etfRaw as Record<string, unknown>).sparkline90d ?? (etfRaw as Record<string, unknown>).sparkline_90d) as number[] : [],
    } : undefined;

    const cbRaw = raw.cbReserves ?? raw.cb_reserves as Record<string, unknown> | undefined;
    const cbReserves = cbRaw && typeof cbRaw === 'object' ? {
      asOfMonth: String((cbRaw as Record<string, unknown>).asOfMonth ?? (cbRaw as Record<string, unknown>).as_of_month ?? ''),
      totalTonnes: Number((cbRaw as Record<string, unknown>).totalTonnes ?? (cbRaw as Record<string, unknown>).total_tonnes ?? 0),
      topHolders: (Array.isArray((cbRaw as Record<string, unknown>).topHolders ?? (cbRaw as Record<string, unknown>).top_holders) ? ((cbRaw as Record<string, unknown>).topHolders ?? (cbRaw as Record<string, unknown>).top_holders) as unknown[] : []).map((h: unknown): GoldCbHolder => {
        const r = h as Record<string, unknown>;
        return { iso3: String(r.iso3 ?? ''), name: String(r.name ?? ''), tonnes: Number(r.tonnes ?? 0), pctOfReserves: Number(r.pctOfReserves ?? r.pct_of_reserves ?? 0) };
      }),
      topBuyers12m: (Array.isArray((cbRaw as Record<string, unknown>).topBuyers12m ?? (cbRaw as Record<string, unknown>).top_buyers_12m) ? ((cbRaw as Record<string, unknown>).topBuyers12m ?? (cbRaw as Record<string, unknown>).top_buyers_12m) as unknown[] : []).map((m: unknown): GoldCbMover => {
        const r = m as Record<string, unknown>;
        return { iso3: String(r.iso3 ?? ''), name: String(r.name ?? ''), deltaTonnes12m: Number(r.deltaTonnes12m ?? r.delta_tonnes_12m ?? 0) };
      }),
      topSellers12m: (Array.isArray((cbRaw as Record<string, unknown>).topSellers12m ?? (cbRaw as Record<string, unknown>).top_sellers_12m) ? ((cbRaw as Record<string, unknown>).topSellers12m ?? (cbRaw as Record<string, unknown>).top_sellers_12m) as unknown[] : []).map((m: unknown): GoldCbMover => {
        const r = m as Record<string, unknown>;
        return { iso3: String(r.iso3 ?? ''), name: String(r.name ?? ''), deltaTonnes12m: Number(r.deltaTonnes12m ?? r.delta_tonnes_12m ?? 0) };
      }),
    } : undefined;

    return {
      goldPrice: Number(raw.goldPrice ?? raw.gold_price ?? 0),
      goldChangePct: Number(raw.goldChangePct ?? raw.gold_change_pct ?? 0),
      goldSparkline: Array.isArray(raw.goldSparkline ?? raw.gold_sparkline) ? (raw.goldSparkline ?? raw.gold_sparkline) as number[] : [],
      silverPrice: Number(raw.silverPrice ?? raw.silver_price ?? 0),
      platinumPrice: Number(raw.platinumPrice ?? raw.platinum_price ?? 0),
      palladiumPrice: Number(raw.palladiumPrice ?? raw.palladium_price ?? 0),
      goldSilverRatio: raw.goldSilverRatio != null ? Number(raw.goldSilverRatio ?? raw.gold_silver_ratio) : undefined,
      goldPlatinumPremiumPct: raw.goldPlatinumPremiumPct != null ? Number(raw.goldPlatinumPremiumPct ?? raw.gold_platinum_premium_pct) : undefined,
      crossCurrencyPrices,
      cot,
      updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
      unavailable: false,
      session,
      returns,
      range52w,
      drivers,
      etfFlows,
      cbReserves,
    };
  } catch {
    return EMPTY;
  }
}
