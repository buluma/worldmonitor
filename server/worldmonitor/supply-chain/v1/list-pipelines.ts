import type {
  ServerContext,
  ListPipelinesRequest,
  ListPipelinesResponse,
  PipelineEntry,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';
import { derivePipelinePublicBadge } from '../../../../src/shared/pipeline-evidence';

const GAS_KEY = 'energy:pipelines:gas:v1';
const OIL_KEY = 'energy:pipelines:oil:v1';

interface RawRegistry {
  pipelines?: Record<string, unknown>;
  classifierVersion?: string;
  fetchedAt?: string;
}

function projectRawPipeline(raw: Record<string, unknown>): PipelineEntry {
  const evidence = raw.evidence as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    operator: String(raw.operator ?? ''),
    commodityType: String(raw.commodityType ?? ''),
    fromCountry: String(raw.fromCountry ?? ''),
    toCountry: String(raw.toCountry ?? ''),
    transitCountries: Array.isArray(raw.transitCountries) ? raw.transitCountries.map(String) : [],
    capacityBcmYr: Number(raw.capacityBcmYr ?? 0),
    capacityMbd: Number(raw.capacityMbd ?? 0),
    lengthKm: Number(raw.lengthKm ?? 0),
    inService: Number(raw.inService ?? 0),
    startPoint: raw.startPoint ? { lat: Number((raw.startPoint as any).lat), lon: Number((raw.startPoint as any).lon) } : undefined,
    endPoint: raw.endPoint ? { lat: Number((raw.endPoint as any).lat), lon: Number((raw.endPoint as any).lon) } : undefined,
    waypoints: Array.isArray(raw.waypoints) ? raw.waypoints.map((w: any) => ({ lat: Number(w.lat), lon: Number(w.lon) })) : [],
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
      lastEvidenceUpdate: String(evidence.lastEvidenceUpdate ?? ''),
      classifierVersion: String(evidence.classifierVersion ?? ''),
      classifierConfidence: Number(evidence.classifierConfidence ?? 0),
    } : undefined,
    publicBadge: derivePipelinePublicBadge(evidence ?? null),
  };
}

export async function listPipelines(
  _ctx: ServerContext,
  req: ListPipelinesRequest,
): Promise<ListPipelinesResponse> {
  try {
    const [gasRaw, oilRaw] = await Promise.all([
      getCachedJson(GAS_KEY, true) as Promise<RawRegistry | null>,
      getCachedJson(OIL_KEY, true) as Promise<RawRegistry | null>,
    ]);

    const gasPipelines = gasRaw?.pipelines ? Object.values(gasRaw.pipelines).map(e => projectRawPipeline(e as Record<string, unknown>)) : [];
    const oilPipelines = oilRaw?.pipelines ? Object.values(oilRaw.pipelines).map(e => projectRawPipeline(e as Record<string, unknown>)) : [];

    let pipelines = [...gasPipelines, ...oilPipelines];
    if (req.commodityType) pipelines = pipelines.filter(p => p.commodityType === req.commodityType);

    const fetchedAt = gasRaw?.fetchedAt ?? oilRaw?.fetchedAt ?? '';
    const classifierVersion = gasRaw?.classifierVersion ?? oilRaw?.classifierVersion ?? '';

    return { pipelines, fetchedAt, classifierVersion, upstreamUnavailable: pipelines.length === 0 };
  } catch {
    return { pipelines: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };
  }
}
