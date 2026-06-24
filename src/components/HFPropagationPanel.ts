import { Panel } from './Panel';
import { getHydratedData } from '@/services/bootstrap';
import { escapeHtml } from '@/utils/sanitize';

interface BandCondition {
  day: string;
  night: string;
}

interface PropagationData {
  solarFlux: number;
  sunspots: number;
  aIndex: number;
  kIndex: number;
  xray: string;
  aurora: number;
  solarWind: number;
  magneticField: number;
  signalNoise: string;
  geomagField: string;
  bands: Record<string, BandCondition>;
  updated: string;
  fetchedAt: string;
}

const BAND_ORDER = ['80m-40m', '30m-20m', '17m-15m', '12m-10m', 'E-Skip', 'vhf-aurora'];

function conditionColor(cond: string): string {
  const c = cond.toLowerCase();
  if (c === 'good') return 'var(--status-live)';
  if (c === 'fair') return 'var(--semantic-elevated)';
  if (c === 'poor') return 'var(--semantic-critical)';
  return 'var(--text-dim)';
}

function kIndexColor(k: number): string {
  if (k <= 2) return 'var(--status-live)';
  if (k <= 4) return 'var(--semantic-elevated)';
  return 'var(--semantic-critical)';
}

export class HFPropagationPanel extends Panel {
  constructor() {
    super({
      id: 'hf-propagation',
      title: 'HF Propagation',
      showCount: false,
      infoTooltip: 'Solar and ionospheric conditions affecting HF radio propagation. Data from hamqsl.com.',
    });
    this.setContent('<div style="padding:12px;color:var(--text-dim)">Waiting for propagation data…</div>');
    const data = getHydratedData('hfPropagation') as PropagationData | undefined;
    if (data) this.refresh(data);
  }

  public refresh(data: PropagationData): void {
    if (!data || !data.solarFlux) {
      this.setContent('<div style="padding:12px;color:var(--text-dim)">No propagation data available.</div>');
      return;
    }

    const kColor = kIndexColor(data.kIndex);
    const bandRows = BAND_ORDER.map(band => {
      const b = data.bands[band];
      if (!b) return '';
      return `<tr>
        <td style="font-weight:600;font-size:11px">${escapeHtml(band)}</td>
        <td style="color:${conditionColor(b.day)};font-size:11px">${escapeHtml(b.day)}</td>
        <td style="color:${conditionColor(b.night)};font-size:11px">${escapeHtml(b.night)}</td>
      </tr>`;
    }).join('');

    this.setContent(`
      <div style="padding:8px 12px">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700">${data.solarFlux}</div>
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase">SFI</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700">${data.sunspots}</div>
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase">Sunspots</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700;color:${kColor}">${data.kIndex}</div>
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase">K-Index</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700">${data.aIndex}</div>
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase">A-Index</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;font-size:10px;color:var(--text-dim)">
          <div>X-Ray: <span style="color:var(--text)">${escapeHtml(data.xray)}</span></div>
          <div>Aurora: <span style="color:var(--text)">${data.aurora}</span></div>
          <div>Wind: <span style="color:var(--text)">${data.solarWind} km/s</span></div>
          <div>Bz: <span style="color:var(--text)">${data.magneticField} nT</span></div>
          <div>Noise: <span style="color:var(--text)">${escapeHtml(data.signalNoise)}</span></div>
          <div>Geomag: <span style="color:var(--text)">${escapeHtml(data.geomagField)}</span></div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;font-size:10px;color:var(--text-dim);padding:4px 0">Band</th>
            <th style="text-align:left;font-size:10px;color:var(--text-dim);padding:4px 0">Day</th>
            <th style="text-align:left;font-size:10px;color:var(--text-dim);padding:4px 0">Night</th>
          </tr></thead>
          <tbody>${bandRows}</tbody>
        </table>
        <div style="margin-top:8px;font-size:9px;color:var(--text-dim)">Updated: ${escapeHtml(data.updated)}</div>
      </div>
    `);
  }
}
