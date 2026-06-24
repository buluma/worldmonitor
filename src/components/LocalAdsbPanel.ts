import { Panel } from './Panel';
import { getHydratedData } from '@/services/bootstrap';
import { escapeHtml } from '@/utils/sanitize';

interface LocalAircraft {
  hex: string;
  callsign: string;
  lat: number;
  lon: number;
  altBaro: number | null;
  gs: number | null;
  track: number | null;
  type: string | null;
  registration: string | null;
  onGround: boolean;
  squawk: string | null;
  rssi: number | null;
}

interface FeederStats {
  gainDb: number;
  noise: number;
  signal: number;
  peakSignal: number;
  messages1m: number;
  messagesTotal: number;
  maxRangeNm: number;
  tracksTotal: number;
}

interface LocalAdsbData {
  aircraft: LocalAircraft[];
  total: number;
  withPosition: number;
  feeder: { lat: number; lon: number; rangeNm: number };
  stats?: FeederStats | null;
  fetchedAt: string;
}

export class LocalAdsbPanel extends Panel {
  constructor() {
    super({
      id: 'local-adsb',
      title: 'Local ADS-B',
      showCount: true,
      closable: true,
      infoTooltip: 'Aircraft tracked by your local ADS-B receiver.',
    });
    this.setContent('<div style="padding:12px;color:var(--text-dim)">Waiting for feeder data…</div>');
    const data = getHydratedData('localAdsb') as LocalAdsbData | undefined;
    if (data) this.refresh(data);
  }

  public refresh(data: LocalAdsbData): void {
    if (!data || !data.aircraft || data.aircraft.length === 0) {
      this.setCount(0);
      const es = data.stats;
      const emptyStats = es ? `<div style="margin-top:8px;font-size:10px;color:var(--text-dim)">Receiver: ${es.messages1m} msg/min · noise ${es.noise.toFixed(1)} dB · ${es.tracksTotal} lifetime tracks</div>` : '';
      this.setContent(`<div style="padding:12px;color:var(--text-dim)">No aircraft in range.${emptyStats}</div>`);
      return;
    }

    this.setCount(data.withPosition);

    const sorted = [...data.aircraft].sort((a, b) => {
      if (a.onGround !== b.onGround) return a.onGround ? 1 : -1;
      return (b.altBaro ?? 0) - (a.altBaro ?? 0);
    });

    const rows = sorted.slice(0, 20).map(a => {
      const alt = a.onGround ? 'GND' : a.altBaro != null ? `${(a.altBaro / 1000).toFixed(1)}k` : '?';
      const speed = a.gs != null ? `${Math.round(a.gs)}kt` : '';
      const id = a.callsign || a.hex;
      const typeStr = a.type ? ` · ${escapeHtml(a.type)}` : '';
      const regStr = a.registration ? ` (${escapeHtml(a.registration)})` : '';
      const sqk = a.squawk === '7700' ? ' <span style="color:var(--semantic-critical);font-weight:700">7700</span>'
        : a.squawk === '7600' ? ' <span style="color:var(--semantic-elevated)">7600</span>'
        : a.squawk === '7500' ? ' <span style="color:var(--semantic-critical)">7500</span>'
        : '';

      return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border-subtle);font-size:11px">
        <div>
          <span style="font-weight:600;font-family:var(--font-mono,monospace)">${escapeHtml(id)}</span>${regStr}${typeStr}${sqk}
        </div>
        <div style="color:var(--text-dim);white-space:nowrap">${alt} ${speed}</div>
      </div>`;
    }).join('');

    const age = data.fetchedAt ? new Date(data.fetchedAt) : null;
    const agoStr = age ? `${Math.round((Date.now() - age.getTime()) / 1000)}s ago` : '';

    const s = data.stats;
    const statsRow = s ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
        <div style="text-align:center"><div style="font-size:13px;font-weight:600">${s.messages1m}</div><div style="font-size:8px;color:var(--text-dim)">MSG/MIN</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:600">${s.noise.toFixed(1)}</div><div style="font-size:8px;color:var(--text-dim)">NOISE dB</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:600">${s.signal.toFixed(1)}</div><div style="font-size:8px;color:var(--text-dim)">SIGNAL dB</div></div>
        <div style="text-align:center"><div style="font-size:13px;font-weight:600">${s.gainDb}</div><div style="font-size:8px;color:var(--text-dim)">GAIN dB</div></div>
      </div>` : '';

    this.setContent(`
      <div style="padding:4px 12px 8px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-bottom:6px">
          <span>${data.withPosition} tracked · ${data.total} total${s ? ` · ${s.tracksTotal} lifetime` : ''}</span>
          <span>${agoStr}</span>
        </div>
        ${statsRow}
        ${rows}
        ${sorted.length > 20 ? `<div style="font-size:10px;color:var(--text-dim);padding:6px 0">+ ${sorted.length - 20} more</div>` : ''}
      </div>
    `);
  }
}
