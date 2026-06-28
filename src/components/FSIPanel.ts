/**
 * FSI (Financial Stress Index) Panel.
 *
 * Shows two composite stress indicators side-by-side:
 *  - US FSI: computed from VIX, HY spread, HYG/TLT prices (requires fear-greed Wave-2 backend).
 *  - EU CISS: ECB Composite Indicator of Systemic Stress (backed by getEuFsi RPC, available now).
 *
 * US section degrades gracefully when fearGreedIndex bootstrap key is absent — it will
 * display as "pending" until Wave-2 ports the fear-greed seeder + market RPC method.
 */

import type { EconomicServiceClient, GetEuFsiResponse } from '@/generated/client/worldmonitor/economic/v1/service_client';
import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { getHydratedData } from '@/services/bootstrap';
import { CISS_STALE_THRESHOLD_MS } from '@/shared/ciss-staleness';

let _economicClient: EconomicServiceClient | null = null;
async function getEconomicClient(): Promise<EconomicServiceClient> {
  if (!_economicClient) {
    const { EconomicServiceClient } = await import('@/generated/client/worldmonitor/economic/v1/service_client');
    const { getRpcBaseUrl } = await import('@/services/rpc-client');
    _economicClient = new EconomicServiceClient(getRpcBaseUrl(), { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });
  }
  return _economicClient;
}

function fsiLabelColor(label: string): string {
  if (label === 'Low Stress') return '#27ae60';
  if (label === 'Moderate Stress') return '#f39c12';
  if (label === 'Elevated Stress') return '#e67e22';
  return '#c0392b';
}

function cissLabelColor(label: string): string {
  if (label === 'Low') return '#27ae60';
  if (label === 'Moderate') return '#f39c12';
  if (label === 'Elevated') return '#e67e22';
  return '#c0392b';
}

// Client-side staleness fallback for hydrated-bootstrap path, which lacks
// the server-computed `stale` flag. Mirrors the logic in get-eu-fsi.ts.
function cissIsStale(latestDate: string): boolean {
  const ts = Date.parse(latestDate);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > CISS_STALE_THRESHOLD_MS;
}

function metricCard(label: string, value: string): string {
  return `<div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px 10px;border:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${escapeHtml(label)}</div>
    <div style="font-size:16px;font-weight:600;color:var(--text)">${escapeHtml(value)}</div>
  </div>`;
}

export class FSIPanel extends Panel {
  private _hasData = false;

  constructor() {
    super({ id: 'fsi', title: t('components.fsi.title'), showCount: false, infoTooltip: t('components.fsi.infoTooltip') });
  }

  public async fetchData(): Promise<boolean> {
    this.showLoading();
    try {
      // US FSI — reads from fearGreedIndex bootstrap key (seeded by Wave-2 fear-greed backend).
      // Degrades gracefully: shows the EU section regardless, US section shows "pending".
      const hydrated = getHydratedData('fearGreedIndex') as Record<string, unknown> | undefined;
      let fsiValue = 0;
      let fsiLabel = '';
      let hygPrice = 0;
      let tltPrice = 0;
      let vix = 0;
      let hySpread = 0;

      if (hydrated && !hydrated.unavailable) {
        const hdr = (hydrated.headerMetrics ?? {}) as Record<string, Record<string, unknown> | null>;
        fsiValue = Number(hdr?.fsi?.value ?? 0);
        fsiLabel = String(hdr?.fsi?.label ?? '');
        vix = Number(hdr?.vix?.value ?? 0);
        hySpread = Number(hdr?.hySpread?.value ?? 0);
      }

      // EU CISS — fully available via getEuFsi RPC (Wave-1)
      let euFsi: GetEuFsiResponse | null = null;
      try {
        const hydratedEuFsi = getHydratedData('euFsi') as GetEuFsiResponse | undefined;
        if (hydratedEuFsi && !hydratedEuFsi.unavailable && Number.isFinite(hydratedEuFsi.latestValue)) {
          euFsi = hydratedEuFsi;
        } else {
          const econClient = await getEconomicClient();
          const euResp = await econClient.getEuFsi({});
          if (!euResp.unavailable && Number.isFinite(euResp.latestValue)) euFsi = euResp;
        }
      } catch {
        // CISS fetch failed — render US section only
      }

      if (fsiValue <= 0 && !euFsi) {
        if (!this._hasData) this.showError(t('components.fsi.errors.unavailable'), () => void this.fetchData());
        return false;
      }

      this._hasData = true;
      this.render({ fsiValue, fsiLabel, hygPrice, tltPrice, vix, hySpread }, euFsi);
      return true;
    } catch (e) {
      if (!this._hasData) this.showError(e instanceof Error ? e.message : t('components.fsi.errors.failedToLoad'), () => void this.fetchData());
      return false;
    }
  }

  private render(
    resp: { fsiValue: number; fsiLabel: string; hygPrice: number; tltPrice: number; vix: number; hySpread: number },
    euFsi: GetEuFsiResponse | null,
  ): void {
    const { fsiValue, fsiLabel, hygPrice, tltPrice, vix, hySpread } = resp;

    const usFsiSection = fsiValue > 0
      ? (() => {
          const labelColor = fsiLabelColor(fsiLabel);
          const fillPct = Math.min(Math.max((fsiValue / 2.5) * 100, 0), 100);
          return `
            <div style="text-align:center;margin-bottom:16px">
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">US Financial Stress Index</div>
              <div style="font-size:36px;font-weight:700;color:${labelColor};line-height:1">${fsiValue.toFixed(4)}</div>
              <div style="font-size:13px;font-weight:600;color:${labelColor};margin-top:4px">${escapeHtml(fsiLabel)}</div>
            </div>
            <div style="margin:0 0 12px">
              <div style="background:rgba(255,255,255,0.07);border-radius:4px;height:8px;overflow:hidden">
                <div style="height:100%;width:${fillPct.toFixed(1)}%;background:linear-gradient(90deg,#c0392b,#f39c12,#27ae60);border-radius:4px"></div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
              ${metricCard('VIX', vix > 0 ? vix.toFixed(2) : 'N/A')}
              ${metricCard('HY Spread', hySpread > 0 ? hySpread.toFixed(2) + '%' : 'N/A')}
              ${metricCard('HYG', hygPrice > 0 ? '$' + hygPrice.toFixed(2) : 'N/A')}
              ${metricCard('TLT', tltPrice > 0 ? '$' + tltPrice.toFixed(2) : 'N/A')}
            </div>`;
        })()
      : `<div style="padding:12px;color:var(--text-dim);font-size:11px;background:rgba(255,255,255,0.03);border-radius:6px;margin-bottom:12px">
           US FSI data pending Wave-2 fear-greed seeder port.
         </div>`;

    const cissStale = euFsi ? (euFsi.stale || cissIsStale(euFsi.latestDate)) : false;
    const cissSection = euFsi
      ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07)">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">EU CISS (ECB)</div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="font-size:28px;font-weight:700;color:${cissLabelColor(euFsi.label)};line-height:1">${euFsi.latestValue.toFixed(4)}</div>
            <div>
              <div style="font-size:12px;font-weight:600;color:${cissLabelColor(euFsi.label)}">${escapeHtml(euFsi.label)}</div>
              <div style="font-size:10px;color:${cissStale ? '#e67e22' : 'var(--text-dim)'}">${escapeHtml(euFsi.latestDate ? new Date(euFsi.latestDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '')}</div>
            </div>
          </div>
          ${cissStale ? `<div style="font-size:9px;color:#e67e22;background:rgba(230,126,34,0.1);border-radius:4px;padding:4px 6px;margin-bottom:8px">⚠ CISS data may be stale — ECB publication lag</div>` : ''}
          <div style="background:rgba(255,255,255,0.07);border-radius:4px;height:6px;overflow:hidden">
            <div style="height:100%;width:${(euFsi.latestValue * 100).toFixed(1)}%;background:linear-gradient(90deg,#27ae60,#f39c12,#c0392b);border-radius:4px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-dim);margin-top:3px">
            <span>No Stress</span><span>Extreme Stress</span>
          </div>
        </div>`
      : '';

    const html = `<div style="padding:12px 14px">${usFsiSection}${cissSection}</div>`;
    this.setSafeContent(unsafeRawHtml(html, 'RPC data escaped at each interpolation point via escapeHtml'));
  }
}
