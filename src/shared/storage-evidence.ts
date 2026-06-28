export const STORAGE_BADGE_DERIVER_VERSION = 'storage-badge-deriver-v1';

export type StoragePublicBadge = 'operational' | 'reduced' | 'offline' | 'disputed';

export interface StorageEvidenceInput {
  physicalState?: string;
  physicalStateSource?: string;
  operatorStatement?: { text?: string; url?: string; date?: string } | null;
  commercialState?: string;
  sanctionRefs?: ReadonlyArray<{ authority?: string; listId?: string; date?: string; url?: string }>;
  fillDisclosed?: boolean;
  fillSource?: string | null;
  lastEvidenceUpdate?: string;
  classifierVersion?: string;
  classifierConfidence?: number;
}

const EVIDENCE_STALENESS_DAYS = 14;

export function deriveStoragePublicBadge(
  evidence: StorageEvidenceInput | null | undefined,
  nowMs: number = Date.now(),
): StoragePublicBadge {
  if (!evidence) return 'disputed';

  const stale = isStale(evidence.lastEvidenceUpdate, nowMs);
  const physical = evidence.physicalState;

  if (physical === 'offline') {
    const hasSanctionEvidence = (evidence.sanctionRefs?.length ?? 0) > 0;
    const hasCommercialHalt =
      evidence.commercialState === 'expired' || evidence.commercialState === 'suspended';
    const hasOperatorStatement = evidence.operatorStatement != null &&
      ((evidence.operatorStatement.text?.length ?? 0) > 0);
    const hasExternalSignal = ['press', 'ais-relay', 'satellite'].includes(
      evidence.physicalStateSource ?? '',
    );

    if (hasSanctionEvidence || hasCommercialHalt) return stale ? 'disputed' : 'offline';
    if (hasOperatorStatement) return stale ? 'disputed' : 'offline';
    if (hasExternalSignal) return 'disputed';
    return 'disputed';
  }

  if (physical === 'reduced') return stale ? 'disputed' : 'reduced';
  if (physical === 'operational') return 'operational';
  return 'disputed';
}

function isStale(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return (nowMs - t) / (1000 * 60 * 60 * 24) > EVIDENCE_STALENESS_DAYS;
}
