import { getHydratedData } from '@/services/bootstrap';

export interface RawPipelineRegistry {
  pipelines?: Record<string, unknown>;
  classifierVersion?: string;
  updatedAt?: string;
}

interface CachedRegistries {
  gas: RawPipelineRegistry | undefined;
  oil: RawPipelineRegistry | undefined;
  source: 'bootstrap' | 'rpc' | 'none';
}

let cache: CachedRegistries = { gas: undefined, oil: undefined, source: 'none' };
let drained = false;

type BootstrapReader = (key: string) => unknown;
function defaultBootstrapReader(key: string): unknown {
  if (key === 'pipelinesGas') return getHydratedData('pipelinesGas');
  if (key === 'pipelinesOil') return getHydratedData('pipelinesOil');
  return getHydratedData(key);
}
let reader: BootstrapReader = defaultBootstrapReader;

export function getCachedPipelineRegistries(): CachedRegistries {
  if (!drained) {
    drained = true;
    const gas = reader('pipelinesGas') as RawPipelineRegistry | undefined;
    const oil = reader('pipelinesOil') as RawPipelineRegistry | undefined;
    if (gas || oil) {
      cache = { gas, oil, source: 'bootstrap' };
    }
  }
  return cache;
}

export function setCachedPipelineRegistries(update: {
  gas?: RawPipelineRegistry;
  oil?: RawPipelineRegistry;
}): void {
  drained = true;
  cache = {
    gas: update.gas ?? cache.gas,
    oil: update.oil ?? cache.oil,
    source: 'rpc',
  };
}

export function __resetPipelineRegistryStoreForTests(): void {
  cache = { gas: undefined, oil: undefined, source: 'none' };
  drained = false;
  reader = defaultBootstrapReader;
}

export function __setBootstrapReaderForTests(fn: (key: string) => unknown): void {
  reader = fn;
}
