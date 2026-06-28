import { escapeHtml } from './sanitize';

export type AttributionSourceType =
  | 'operator'
  | 'regulator'
  | 'ais'
  | 'satellite'
  | 'press'
  | 'classifier'
  | 'derived';

export interface AttributionFooterInput {
  sourceType: AttributionSourceType;
  method?: string;
  sampleSize?: number;
  sampleLabel?: string;
  updatedAt?: string | Date | number | null;
  confidence?: number;
  creditName?: string;
  creditUrl?: string;
  classifierVersion?: string;
}

function formatWhen(raw: AttributionFooterInput['updatedAt']): string | null {
  if (raw == null) return null;
  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const deltaMs = Date.now() - d.getTime();
    const mins = Math.round(deltaMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  } catch {
    return null;
  }
}

function confidenceLabel(c: number | undefined): string | null {
  if (c == null) return null;
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

const SOURCE_LABEL: Record<AttributionSourceType, string> = {
  operator: 'operator disclosure',
  regulator: 'regulator data',
  ais: 'AIS calibration',
  satellite: 'satellite imagery',
  press: 'press / wire',
  classifier: 'evidence classifier',
  derived: 'derived metric',
};

export function attributionFooterHtml(input: AttributionFooterInput): string {
  const parts: string[] = [];

  parts.push(escapeHtml(SOURCE_LABEL[input.sourceType]));
  if (input.method) parts.push(escapeHtml(input.method));

  if (typeof input.sampleSize === 'number' && Number.isFinite(input.sampleSize)) {
    const label = input.sampleLabel || 'obs';
    parts.push(`${input.sampleSize.toLocaleString()} ${escapeHtml(label)}`);
  }

  const when = formatWhen(input.updatedAt);
  if (when) parts.push(`updated ${when}`);

  const conf = confidenceLabel(input.confidence);
  if (conf) parts.push(`${conf} confidence`);

  if (input.classifierVersion) parts.push(`classifier ${escapeHtml(input.classifierVersion)}`);

  const creditHtml = input.creditName
    ? (input.creditUrl
      ? ` · <a href="${escapeHtml(input.creditUrl)}" target="_blank" rel="noopener" class="attr-credit">${escapeHtml(input.creditName)}</a>`
      : ` · <span class="attr-credit">${escapeHtml(input.creditName)}</span>`)
    : '';

  const dataAttrs = [
    `data-attr-source="${escapeHtml(input.sourceType)}"`,
    input.method ? `data-attr-method="${escapeHtml(input.method)}"` : '',
    typeof input.sampleSize === 'number' ? `data-attr-n="${input.sampleSize}"` : '',
    input.confidence != null ? `data-attr-confidence="${input.confidence.toFixed(2)}"` : '',
    input.classifierVersion ? `data-attr-classifier="${escapeHtml(input.classifierVersion)}"` : '',
  ].filter(Boolean).join(' ');

  return `<div class="panel-attribution-footer" ${dataAttrs}>${parts.join(' · ')}${creditHtml}</div>`;
}

export const ATTRIBUTION_FOOTER_CSS = `
<style>
  .panel-attribution-footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.05);
    font-size: 9px;
    color: var(--text-dim, #888);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .panel-attribution-footer .attr-credit { color: var(--text-dim, #888); text-decoration: none; }
  .panel-attribution-footer .attr-credit:hover { text-decoration: underline; }
</style>
`;
