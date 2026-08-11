import { Panel } from './Panel';
import { getHydratedData } from '@/services/bootstrap';
import { escapeHtml } from '@/utils/sanitize';

interface AcarsMessage {
  uid: string;
  timestamp: number | null;
  messageType: string | null; // 'ACARS' | 'VDL-M2' | 'HFDL'
  stationId: string | null;
  icaoHex: string | null;
  tail: string | null;
  flight: string | null;
  iataFlight: string | null;
  airline: string | null;
  label: string | null;
  labelType: string | null;
  text: string | null;
  freq: number | null;
  level: number | null;
  isOnground: boolean;
  libacars: Record<string, unknown> | null;
  matched: boolean;
  matchedText: string[];
}

interface DecoderStatus {
  Status?: string;
  Connected?: boolean;
  Alive?: boolean;
}

interface AcarsData {
  messages: AcarsMessage[];
  decoders: Record<string, DecoderStatus> | null;
  fetchedAt: string;
}

// OOOI (Out/Off/On/In) and position-report labels get a distinct badge —
// these are the operationally interesting events (departure/arrival, track).
const OOOI_LABELS = new Set(['15', '16', '17', '36']); // position/weather reports commonly double as track updates
const POSITION_LABELS = new Set(['15', '16', '17']);

export class AcarsPanel extends Panel {
  constructor() {
    super({
      id: 'acars',
      title: 'ACARS / VDL2',
      showCount: true,
      closable: true,
      infoTooltip: 'Decoded ACARS, VDL-M2, and HFDL datalink messages from your local receiver.',
    });
    this.showLoading('Connecting to decoder…');
    const data = getHydratedData('acars') as AcarsData | undefined;
    if (data) this.refresh(data);
  }

  public refresh(data: AcarsData): void {
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      this.setCount(0);
      this.setContent(`<div style="padding:12px;color:var(--text-dim)">No datalink traffic.${this.decoderStatusLine(data?.decoders)}</div>`);
      return;
    }

    this.setCount(data.messages.length);

    const rows = data.messages.slice(0, 40).map(m => {
      const id = m.flight || m.tail || m.icaoHex || '?';
      const typeColor = m.messageType === 'HFDL' ? 'var(--status-info)'
        : m.messageType === 'ACARS' ? 'var(--status-live)'
        : 'var(--semantic-elevated)'; // VDL-M2
      const typeTag = `<span style="font-size:8px;font-weight:700;color:${typeColor};border:1px solid ${typeColor};border-radius:3px;padding:0 3px">${escapeHtml(m.messageType || '?')}</span>`;
      const evtTag = m.label && OOOI_LABELS.has(m.label)
        ? `<span style="font-size:8px;color:var(--text-dim)">${POSITION_LABELS.has(m.label) ? 'POS' : 'RPT'}</span>`
        : '';
      const airlineStr = m.airline ? ` · ${escapeHtml(m.airline)}` : '';
      const labelStr = m.labelType ? escapeHtml(m.labelType) : (m.label ? `Label ${escapeHtml(m.label)}` : '');
      const text = m.text ? escapeHtml(m.text.trim().slice(0, 160)) : '';
      const age = m.timestamp ? `${Math.max(0, Math.round((Date.now() - m.timestamp) / 1000))}s` : '';

      return `<div style="padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:11px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">
          <div style="display:flex;align-items:baseline;gap:5px;min-width:0">
            ${typeTag}
            <span style="font-weight:600;font-family:var(--font-mono,monospace)">${escapeHtml(id)}</span>${evtTag}
          </div>
          <span style="color:var(--text-dim);white-space:nowrap;font-size:9px">${age}</span>
        </div>
        <div style="color:var(--text-dim);font-size:9px;margin-top:1px">${labelStr}${airlineStr}${m.freq ? ` · ${m.freq}MHz` : ''}</div>
        ${text ? `<div style="margin-top:2px;font-family:var(--font-mono,monospace);font-size:10px;white-space:pre-wrap;word-break:break-word;color:var(--text-secondary,inherit)">${text}</div>` : ''}
      </div>`;
    }).join('');

    this.setContent(`
      <div style="padding:4px 12px 8px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-bottom:6px">
          <span>${data.messages.length} recent message${data.messages.length === 1 ? '' : 's'}</span>
          <span>${this.decoderSummary(data.decoders)}</span>
        </div>
        ${rows}
        ${data.messages.length > 40 ? `<div style="font-size:10px;color:var(--text-dim);padding:6px 0">+ ${data.messages.length - 40} more</div>` : ''}
      </div>
    `);
  }

  private decoderSummary(decoders: AcarsData['decoders']): string {
    if (!decoders) return '';
    return Object.entries(decoders)
      .map(([name, s]) => `${name}: ${s.Alive ? '●' : '○'}`)
      .join(' ');
  }

  private decoderStatusLine(decoders: AcarsData['decoders']): string {
    const summary = this.decoderSummary(decoders);
    return summary ? `<div style="margin-top:8px;font-size:10px;color:var(--text-dim)">${summary}</div>` : '';
  }
}
