import type {
  ServerContext,
  ListStorageFacilitiesRequest,
  ListStorageFacilitiesResponse,
  StorageFacilityEntry,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';
import { deriveStoragePublicBadge } from '../../../../src/shared/storage-evidence';

const REDIS_KEY = 'energy:storage-facilities:v1';

interface RawRegistry {
  facilities?: Record<string, unknown>;
  classifierVersion?: string;
  fetchedAt?: string;
}

function projectRawFacility(raw: Record<string, unknown>): StorageFacilityEntry {
  const evidence = raw.evidence as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    operator: String(raw.operator ?? ''),
    facilityType: String(raw.facilityType ?? ''),
    country: String(raw.country ?? ''),
    location: raw.location ? { lat: Number((raw.location as any).lat), lon: Number((raw.location as any).lon) } : undefined,
    capacityTwh: Number(raw.capacityTwh ?? 0),
    capacityMb: Number(raw.capacityMb ?? 0),
    capacityMtpa: Number(raw.capacityMtpa ?? 0),
    workingCapacityUnit: String(raw.workingCapacityUnit ?? ''),
    inService: Number(raw.inService ?? 0),
    evidence: evidence ? {
      physicalState: String(evidence.physicalState ?? ''),
      physicalStateSource: String(evidence.physicalStateSource ?? ''),
      operatorStatement: evidence.operatorStatement ? {
        text: String((evidence.operatorStatement as any).text ?? ''),
        url: String((evidence.operatorStatement as any).url ?? ''),
        date: String((evidence.operatorStatement as any).date ?? ''),
      } : undefined,
      commercialState: String(evidence.commercialState ?? ''),
      sanctionRefs: Array.isArray(evidence.sanctionRefs) ? evidence.sanctionRefs.map((s: any) => ({
        authority: String(s?.authority ?? ''),
        listId: String(s?.listId ?? ''),
        date: String(s?.date ?? ''),
        url: String(s?.url ?? ''),
      })) : [],
      fillDisclosed: Boolean(evidence.fillDisclosed),
      fillSource: String(evidence.fillSource ?? ''),
      lastEvidenceUpdate: String(evidence.lastEvidenceUpdate ?? ''),
      classifierVersion: String(evidence.classifierVersion ?? ''),
      classifierConfidence: Number(evidence.classifierConfidence ?? 0),
    } : undefined,
    publicBadge: deriveStoragePublicBadge(evidence ?? null),
  };
}

export async function listStorageFacilities(
  _ctx: ServerContext,
  req: ListStorageFacilitiesRequest,
): Promise<ListStorageFacilitiesResponse> {
  try {
    const registry = await getCachedJson(REDIS_KEY, true) as RawRegistry | null;
    if (!registry?.facilities) return { facilities: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };

    let facilities = Object.values(registry.facilities).map(e => projectRawFacility(e as Record<string, unknown>));
    if (req.facilityType) facilities = facilities.filter(f => f.facilityType === req.facilityType);

    return {
      facilities,
      fetchedAt: registry.fetchedAt ?? '',
      classifierVersion: registry.classifierVersion ?? '',
      upstreamUnavailable: false,
    };
  } catch {
    return { facilities: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };
  }
}
