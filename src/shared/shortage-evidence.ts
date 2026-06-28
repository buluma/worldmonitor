export const SHORTAGE_EVIDENCE_VERSION = 'shortage-evidence-v1';

export type ShortageSeverity = 'confirmed' | 'watch';
export type EvidenceQuality = 'strong' | 'moderate' | 'thin';

export interface ShortageEvidenceSourceInput {
  authority?: string;
  title?: string;
  url?: string;
  date?: string;
  sourceType?: string;
}

export interface ShortageEvidenceInput {
  evidenceSources?: ReadonlyArray<ShortageEvidenceSourceInput>;
  firstRegulatorConfirmation?: string | null;
  classifierVersion?: string;
  classifierConfidence?: number;
  lastEvidenceUpdate?: string;
}

const CONFIDENCE_MODERATE = 0.7;
const CONFIDENCE_STRONG = 0.85;
const EVIDENCE_FRESHNESS_DAYS = 30;

export function deriveShortageEvidenceQuality(
  ev: ShortageEvidenceInput | null | undefined,
  nowMs: number = Date.now(),
): EvidenceQuality {
  if (!ev) return 'thin';
  const confidence = ev.classifierConfidence ?? 0;
  const sources = ev.evidenceSources ?? [];
  const authoritativeCount = sources.filter(s =>
    s?.sourceType === 'regulator' || s?.sourceType === 'operator'
  ).length;
  const fresh = !isStale(ev.lastEvidenceUpdate, nowMs);

  if (confidence >= CONFIDENCE_STRONG && authoritativeCount >= 1 && fresh) return 'strong';
  if (confidence >= CONFIDENCE_MODERATE && authoritativeCount >= 1 && fresh) return 'moderate';
  return 'thin';
}

function isStale(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return (nowMs - t) / (1000 * 60 * 60 * 24) > EVIDENCE_FRESHNESS_DAYS;
}

export function countEvidenceSources(
  sources: ReadonlyArray<ShortageEvidenceSourceInput> | null | undefined,
): { authoritative: number; press: number; other: number } {
  if (!sources) return { authoritative: 0, press: 0, other: 0 };
  let authoritative = 0, press = 0, other = 0;
  for (const s of sources) {
    const t = s?.sourceType;
    if (t === 'regulator' || t === 'operator') authoritative++;
    else if (t === 'press') press++;
    else other++;
  }
  return { authoritative, press, other };
}
