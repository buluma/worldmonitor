import type {
  ServerContext,
  ListFuelShortagesRequest,
  ListFuelShortagesResponse,
  FuelShortageEntry,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

const REDIS_KEY = 'energy:fuel-shortages:v1';

interface RawRegistry {
  shortages?: Record<string, unknown>;
  classifierVersion?: string;
  fetchedAt?: string;
}

function projectEntry(raw: Record<string, unknown>): FuelShortageEntry {
  return {
    id: String(raw.id ?? ''),
    country: String(raw.country ?? ''),
    product: String(raw.product ?? ''),
    severity: String(raw.severity ?? ''),
    firstSeen: String(raw.firstSeen ?? ''),
    lastConfirmed: String(raw.lastConfirmed ?? ''),
    resolvedAt: String(raw.resolvedAt ?? ''),
    impactTypes: Array.isArray(raw.impactTypes) ? raw.impactTypes.map(String) : [],
    causeChain: Array.isArray(raw.causeChain) ? raw.causeChain.map(String) : [],
    shortDescription: String(raw.shortDescription ?? ''),
    evidence: raw.evidence ? projectEvidence(raw.evidence as Record<string, unknown>) : undefined,
  };
}

function projectEvidence(raw: Record<string, unknown>) {
  return {
    evidenceSources: Array.isArray(raw.evidenceSources) ? raw.evidenceSources.map((s: any) => ({
      authority: String(s?.authority ?? ''),
      title: String(s?.title ?? ''),
      url: String(s?.url ?? ''),
      date: String(s?.date ?? ''),
      sourceType: String(s?.sourceType ?? ''),
    })) : [],
    firstRegulatorConfirmation: String(raw.firstRegulatorConfirmation ?? ''),
    classifierVersion: String(raw.classifierVersion ?? ''),
    classifierConfidence: Number(raw.classifierConfidence ?? 0),
    lastEvidenceUpdate: String(raw.lastEvidenceUpdate ?? ''),
  };
}

export async function listFuelShortages(
  _ctx: ServerContext,
  req: ListFuelShortagesRequest,
): Promise<ListFuelShortagesResponse> {
  try {
    const registry = await getCachedJson(REDIS_KEY, true) as RawRegistry | null;
    if (!registry?.shortages) return { shortages: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };

    let entries = Object.values(registry.shortages).map(e => projectEntry(e as Record<string, unknown>));

    if (req.country) entries = entries.filter(e => e.country === req.country);
    if (req.product) entries = entries.filter(e => e.product === req.product);
    if (req.severity) entries = entries.filter(e => e.severity === req.severity);

    return {
      shortages: entries,
      fetchedAt: registry.fetchedAt ?? '',
      classifierVersion: registry.classifierVersion ?? '',
      upstreamUnavailable: false,
    };
  } catch {
    return { shortages: [], fetchedAt: '', classifierVersion: '', upstreamUnavailable: true };
  }
}
