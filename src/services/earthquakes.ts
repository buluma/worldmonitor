import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  SeismologyServiceClient,
  type Earthquake,
  type ListEarthquakesResponse,
} from '@/generated/client/worldmonitor/seismology/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getHydratedData } from '@/services/bootstrap';

// Re-export the proto Earthquake type as the domain's public type
export type { Earthquake };

const client = new SeismologyServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });
// Optimized: Disabled persistCache, increased TTL to 60min (earthquakes don't need frequent Redis writes)
const breaker = createCircuitBreaker<ListEarthquakesResponse>({ name: 'Seismology', cacheTtlMs: 60 * 60 * 1000, persistCache: false });

const emptyFallback: ListEarthquakesResponse = { earthquakes: [] };

export async function fetchEarthquakes(): Promise<Earthquake[]> {
  const hydrated = getHydratedData('earthquakes') as ListEarthquakesResponse | undefined;
  if (hydrated?.earthquakes?.length) return hydrated.earthquakes;

  const response = await breaker.execute(async () => {
    return client.listEarthquakes({ minMagnitude: 0, start: 0, end: 0, pageSize: 0, cursor: '' });
  }, emptyFallback);
  return response.earthquakes;
}
