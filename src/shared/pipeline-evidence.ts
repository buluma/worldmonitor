export const PIPELINE_BADGE_DERIVER_VERSION = 'badge-deriver-v1';

export type PipelinePublicBadge = 'flowing' | 'reduced' | 'offline' | 'disputed';

export interface PipelineEvidenceInput {
  physicalState?: string;
  physicalStateSource?: string;
  operatorStatement?: { text?: string; url?: string; date?: string } | null;
  commercialState?: string;
  sanctionRefs?: ReadonlyArray<{ authority?: string; listId?: string; date?: string; url?: string }>;
  lastEvidenceUpdate?: string;
  classifierVersion?: string;
  classifierConfidence?: number;
}

const EVIDENCE_STALENESS_DAYS = 14;

export function derivePipelinePublicBadge(
  evidence: PipelineEvidenceInput | null | undefined,
  nowMs: number = Date.now(),
): PipelinePublicBadge {
  if (!evidence) return 'disputed';

  const stale = isStale(evidence.lastEvidenceUpdate, nowMs);
  const physical = evidence.physicalState;

  if (physical === 'offline') {
    const hasSanctionEvidence = (evidence.sanctionRefs?.length ?? 0) > 0;
    const hasCommercialHalt =
      evidence.commercialState === 'expired' || evidence.commercialState === 'suspended';
    const hasOperatorStatement = evidence.operatorStatement != null &&
      ((evidence.operatorStatement.text?.length ?? 0) > 0);
    const hasExternalSignal = ['press', 'ais-relay', 'satellite', 'gem'].includes(
      evidence.physicalStateSource ?? '',
    );

    if (hasSanctionEvidence || hasCommercialHalt) return stale ? 'disputed' : 'offline';
    if (hasOperatorStatement) return stale ? 'disputed' : 'offline';
    if (hasExternalSignal) return 'disputed';
    return 'disputed';
  }

  if (physical === 'reduced') return stale ? 'disputed' : 'reduced';
  if (physical === 'flowing') return 'flowing';
  return 'disputed';
}

function isStale(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return (nowMs - t) / (1000 * 60 * 60 * 24) > EVIDENCE_STALENESS_DAYS;
}

export function pickNewerClassifierVersion(
  a: string | undefined,
  b: string | undefined,
): string {
  const va = (a || '').trim();
  const vb = (b || '').trim();
  if (!va) return vb || 'v1';
  if (!vb) return va;
  if (va === vb) return va;
  const numA = parseVNum(va);
  const numB = parseVNum(vb);
  if (numA != null && numB != null) return numA >= numB ? va : vb;
  return va >= vb ? va : vb;
}

function parseVNum(v: string): number | null {
  const m = v.match(/^v(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function pickNewerIsoTimestamp(
  a: string | undefined,
  b: string | undefined,
): string {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta >= tb ? (a || '') : (b || '');
  if (Number.isFinite(ta)) return a || '';
  if (Number.isFinite(tb)) return b || '';
  return a || b || '';
}
