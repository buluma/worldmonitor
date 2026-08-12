import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  SupplyChainServiceClient,
  type GetShippingRatesResponse,
  type GetChokepointStatusResponse,
  type GetCriticalMineralsResponse,
  type ShippingIndex,
  type ChokepointInfo,
  type CriticalMineral,
  type MineralProducer,
  type ShippingRatePoint,
} from '@/generated/client/worldmonitor/supply_chain/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';
import {
  type ChinaCorridorControlTowerResponse,
} from '../../../shared/china-corridor-control-towers';
import {
  CHINA_CORRIDOR_BREAKER_CACHE_POLICY,
  fetchChinaCorridorControlTowers as fetchChinaCorridorControlTowersWithDependencies,
} from './china-corridor-control-towers';

export { parseChinaCorridorResponse } from './china-corridor-control-towers';

export type {
  ChinaCorridorCondition,
  ChinaCorridorControlTower,
  ChinaCorridorControlTowerResponse,
  CorridorAvailability,
  CorridorSourceSignal,
} from '../../../shared/china-corridor-control-towers';

export type {
  GetShippingRatesResponse,
  GetChokepointStatusResponse,
  GetCriticalMineralsResponse,
  ShippingIndex,
  ChokepointInfo,
  CriticalMineral,
  MineralProducer,
  ShippingRatePoint,
};

const client = new SupplyChainServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });

// Optimized: Disabled persistCache for chokepoints (high-frequency), kept for shipping/minerals
const shippingBreaker = createCircuitBreaker<GetShippingRatesResponse>({ name: 'Shipping Rates', cacheTtlMs: 60 * 60 * 1000, persistCache: true });
const chokepointBreaker = createCircuitBreaker<GetChokepointStatusResponse>({ name: 'Chokepoint Status', cacheTtlMs: 30 * 60 * 1000, persistCache: false }); // 5min → 30min, no Redis
const mineralsBreaker = createCircuitBreaker<GetCriticalMineralsResponse>({ name: 'Critical Minerals', cacheTtlMs: 24 * 60 * 60 * 1000, persistCache: true });
const chinaCorridorBreaker = createCircuitBreaker<ChinaCorridorControlTowerResponse>({
  name: 'China Corridor Control Towers',
  ...CHINA_CORRIDOR_BREAKER_CACHE_POLICY,
});

const emptyShipping: GetShippingRatesResponse = { indices: [], fetchedAt: '', upstreamUnavailable: false };
const emptyChokepoints: GetChokepointStatusResponse = { chokepoints: [], fetchedAt: '', upstreamUnavailable: false };
const emptyMinerals: GetCriticalMineralsResponse = { minerals: [], fetchedAt: '', upstreamUnavailable: false };

export async function fetchChinaCorridorControlTowers(): Promise<ChinaCorridorControlTowerResponse> {
  return fetchChinaCorridorControlTowersWithDependencies({
    now: () => new Date(),
    getResponse: () => client.getChinaCorridorControlTowers({}),
    execute: (operation, fallback) =>
      chinaCorridorBreaker.execute(operation, fallback),
  });
}

export async function fetchShippingRates(): Promise<GetShippingRatesResponse> {
  const hydrated = getHydratedData('shippingRates') as GetShippingRatesResponse | undefined;
  if (hydrated?.indices?.length) return hydrated;

  try {
    return await shippingBreaker.execute(async () => {
      return client.getShippingRates({});
    }, emptyShipping);
  } catch {
    return emptyShipping;
  }
}

export async function fetchChokepointStatus(): Promise<GetChokepointStatusResponse> {
  const hydrated = getHydratedData('chokepoints') as GetChokepointStatusResponse | undefined;
  // Transit summaries are already folded into the chokepoint payload server-side.
  getHydratedData('chokepointTransits');
  if (hydrated?.chokepoints?.length) return hydrated;

  try {
    return await chokepointBreaker.execute(async () => {
      return client.getChokepointStatus({});
    }, emptyChokepoints);
  } catch {
    return emptyChokepoints;
  }
}

export async function fetchCriticalMinerals(): Promise<GetCriticalMineralsResponse> {
  const hydrated = getHydratedData('minerals') as GetCriticalMineralsResponse | undefined;
  if (hydrated?.minerals?.length) return hydrated;

  try {
    return await mineralsBreaker.execute(async () => {
      return client.getCriticalMinerals({});
    }, emptyMinerals);
  } catch {
    return emptyMinerals;
  }
}
