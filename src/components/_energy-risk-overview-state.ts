// Pure state-building logic for EnergyRiskOverviewPanel. Dep-free so it
// can be tested under node:test without Vite-only module graph.

export interface TileState<T> {
  status: 'fulfilled' | 'rejected' | 'pending';
  value?: T;
  fetchedAt?: number;
}

export interface OverviewState {
  hormuz: TileState<{ status: string }>;
  euGas: TileState<{ fillPct: number; fillPctChange1d: number }>;
  brent: TileState<{ price: number; change: number }>;
  activeDisruptions: TileState<{ count: number }>;
}

interface HormuzMin { status?: string }
interface EuGasMin { unavailable?: boolean; fillPct?: number; fillPctChange1d?: number }
interface BrentResultMin { data?: Array<{ price: number | null; change?: number | null }> }
interface DisruptionsMin {
  upstreamUnavailable?: boolean;
  events?: Array<{ endAt?: string | null }>;
}

export function buildOverviewState(
  hormuz: PromiseSettledResult<HormuzMin | null | undefined>,
  euGas: PromiseSettledResult<EuGasMin | null | undefined>,
  brent: PromiseSettledResult<BrentResultMin | null | undefined>,
  disruptions: PromiseSettledResult<DisruptionsMin | null | undefined>,
  now: number,
): OverviewState {
  return {
    hormuz: hormuz.status === 'fulfilled' && hormuz.value && hormuz.value.status
      ? { status: 'fulfilled', value: { status: hormuz.value.status }, fetchedAt: now }
      : { status: 'rejected' },
    euGas: euGas.status === 'fulfilled' && euGas.value && !euGas.value.unavailable && (euGas.value.fillPct ?? 0) > 0
      ? {
          status: 'fulfilled',
          value: {
            fillPct: euGas.value.fillPct as number,
            fillPctChange1d: euGas.value.fillPctChange1d ?? 0,
          },
          fetchedAt: now,
        }
      : { status: 'rejected' },
    brent: (() => {
      if (brent.status !== 'fulfilled' || !brent.value || !brent.value.data || brent.value.data.length === 0) {
        return { status: 'rejected' as const };
      }
      const q = brent.value.data[0];
      if (!q || q.price === null) return { status: 'rejected' as const };
      return {
        status: 'fulfilled' as const,
        value: { price: q.price, change: q.change ?? 0 },
        fetchedAt: now,
      };
    })(),
    activeDisruptions: disruptions.status === 'fulfilled' && disruptions.value && !disruptions.value.upstreamUnavailable
      ? {
          status: 'fulfilled',
          value: { count: (disruptions.value.events ?? []).filter((e) => !e.endAt).length },
          fetchedAt: now,
        }
      : { status: 'rejected' },
  };
}

export function countDegradedTiles(state: OverviewState): number {
  return Object.values(state).filter((t) => t.status === 'rejected').length;
}
