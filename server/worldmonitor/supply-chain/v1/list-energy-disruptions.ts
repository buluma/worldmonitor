import type {
  ServerContext,
  ListEnergyDisruptionsRequest,
  ListEnergyDisruptionsResponse,
  EnergyDisruptionEntry,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const REDIS_KEY = 'energy:disruptions:v1';

interface RawRegistry {
  events?: Record<string, unknown>;
  classifierVersion?: string;
  fetchedAt?: string;
}

function projectEntry(raw: Record<string, unknown>): EnergyDisruptionEntry {
  return {
    id: String(raw.id ?? ''),
    assetId: String(raw.assetId ?? ''),
    assetType: String(raw.assetType ?? ''),
    eventType: String(raw.eventType ?? ''),
    startAt: String(raw.startAt ?? ''),
    endAt: String(raw.endAt ?? ''),
    capacityOfflineBcmYr: Number(raw.capacityOfflineBcmYr ?? 0),
    capacityOfflineMbd: Number(raw.capacityOfflineMbd ?? 0),
    causeChain: Array.isArray(raw.causeChain) ? raw.causeChain.map(String) : [],
    shortDescription: String(raw.shortDescription ?? ''),
    sources: Array.isArray(raw.sources) ? raw.sources.map((s: any) => ({
      authority: String(s?.authority ?? ''),
      title: String(s?.title ?? ''),
      url: String(s?.url ?? ''),
      date: String(s?.date ?? ''),
      sourceType: String(s?.sourceType ?? ''),
    })) : [],
    classifierVersion: String(raw.classifierVersion ?? ''),
    classifierConfidence: Number(raw.classifierConfidence ?? 0),
    lastEvidenceUpdate: String(raw.lastEvidenceUpdate ?? ''),
    countries: Array.isArray(raw.countries) ? raw.countries.map(String) : [],
  };
}

export async function listEnergyDisruptions(
  _ctx: ServerContext,
  req: ListEnergyDisruptionsRequest,
): Promise<ListEnergyDisruptionsResponse> {
  try {
    const registry = await getCachedJson(REDIS_KEY, true) as RawRegistry | null;
    if (!registry?.events) return { events: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };

    let entries = Object.values(registry.events).map(e => projectEntry(e as Record<string, unknown>));

    if (req.assetId) entries = entries.filter(e => e.assetId === req.assetId);
    if (req.assetType) entries = entries.filter(e => e.assetType === req.assetType);
    if (req.ongoingOnly) entries = entries.filter(e => !e.endAt);

    return {
      events: entries,
      fetchedAt: registry.fetchedAt ?? '',
      classifierVersion: registry.classifierVersion ?? '',
      upstreamUnavailable: false,
    };
  } catch {
    return { events: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };
  }
}
