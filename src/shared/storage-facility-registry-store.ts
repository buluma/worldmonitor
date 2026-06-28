import { getHydratedData } from '@/services/bootstrap';

export interface RawStorageFacilityRegistry {
  facilities?: Record<string, unknown>;
  classifierVersion?: string;
  updatedAt?: string;
}

interface CachedRegistry {
  registry: RawStorageFacilityRegistry | undefined;
  source: 'bootstrap' | 'rpc' | 'none';
}

let cache: CachedRegistry = { registry: undefined, source: 'none' };
let drained = false;

type BootstrapReader = (key: string) => unknown;
function defaultBootstrapReader(key: string): unknown {
  if (key === 'storageFacilities') return getHydratedData('storageFacilities');
  return getHydratedData(key);
}
let reader: BootstrapReader = defaultBootstrapReader;

export function getCachedStorageFacilityRegistry(): CachedRegistry {
  if (!drained) {
    drained = true;
    const registry = reader('storageFacilities') as RawStorageFacilityRegistry | undefined;
    if (registry) {
      cache = { registry, source: 'bootstrap' };
    }
  }
  return cache;
}

export function setCachedStorageFacilityRegistry(registry: RawStorageFacilityRegistry): void {
  drained = true;
  cache = { registry, source: 'rpc' };
}

export function __resetStorageFacilityRegistryStoreForTests(): void {
  cache = { registry: undefined, source: 'none' };
  drained = false;
  reader = defaultBootstrapReader;
}

export function __setBootstrapReaderForTests(fn: (key: string) => unknown): void {
  reader = fn;
}
