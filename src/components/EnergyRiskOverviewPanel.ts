import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { createLazyClient, getRpcBaseUrl, rpcFetch } from '@/services/rpc-client';
import { fetchHormuzTracker, type HormuzTrackerData } from '@/services/hormuz-tracker';
import { getEuGasStorageData } from '@/services/economic';
import { fetchCommodityQuotes } from '@/services/market';
import { SupplyChainServiceClient } from '@/generated/client/worldmonitor/supply_chain/v1/service_client';
import { buildOverviewState, type OverviewState } from './_energy-risk-overview-state';

const getSupplyChainClient = createLazyClient(() => new SupplyChainServiceClient(getRpcBaseUrl(), {
  fetch: rpcFetch,
}));

const BRENT_SYMBOL = 'BZ=F';
const BRENT_META = [{ symbol: BRENT_SYMBOL, name: 'Brent Crude', display: 'BRENT' }];

const DEFAULT_CRISIS_START_DATE = '2026-02-23';
const CRISIS_START_DATE: string =
  (import.meta.env?.VITE_HORMUZ_CRISIS_START_DATE as string | undefined) ||
  DEFAULT_CRISIS_START_DATE;
const CRISIS_START_MS = Date.parse(`${CRISIS_START_DATE}T00:00:00Z`);

const HORMUZ_STATUS_COLOR: Record<HormuzTrackerData['status'], string> = {
  closed:     '#e74c3c',
  disrupted:  '#e74c3c',
  restricted: '#f39c12',
  open:       '#27ae60',
};
const HORMUZ_STATUS_LABEL: Record<HormuzTrackerData['status'], string> = {
  closed:     'Closed',
  disrupted:  'Disrupted',
  restricted: 'Restricted',
  open:       'Open',
};

const EMPTY_STATE: OverviewState = {
  hormuz:            { status: 'pending' },
  euGas:             { status: 'pending' },
  brent:             { status: 'pending' },
  activeDisruptions: { status: 'pending' },
};

export class EnergyRiskOverviewPanel extends Panel {
  private state: OverviewState = EMPTY_STATE;
  private freshnessTickHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'energy-risk-overview',
      title: 'Global Energy Risk Overview',
      defaultRowSpan: 1,
      infoTooltip:
        'Consolidated executive view: Strait of Hormuz vessel status, EU gas ' +
        'storage fill, Brent crude price + 1-day change, active disruption ' +
        'count, data freshness, and a configurable crisis-day counter. Each ' +
        'tile renders independently; one source failing does not block the ' +
        'others.',
    });
  }

  public destroy(): void {
    if (this.freshnessTickHandle !== null) {
      clearInterval(this.freshnessTickHandle);
      this.freshnessTickHandle = null;
    }
    super.destroy?.();
  }

  public async fetchData(): Promise<void> {
    const [hormuz, euGas, brent, disruptions] = await Promise.allSettled([
      fetchHormuzTracker(),
      getEuGasStorageData(),
      fetchCommodityQuotes(BRENT_META),
      getSupplyChainClient().listEnergyDisruptions({ assetId: '', assetType: '', ongoingOnly: true }),
    ]);
    this.state = buildOverviewState(hormuz, euGas, brent, disruptions, Date.now());

    if (!this.element?.isConnected) return;
    this.render();

    if (this.freshnessTickHandle === null) {
      this.freshnessTickHandle = setInterval(() => {
        if (this.element?.isConnected) this.render();
      }, 60_000);
    }
  }

  private render(): void {
    injectRiskOverviewStylesOnce();
    const html = `
      <div class="ero-grid">
        ${this.renderHormuzTile()}
        ${this.renderEuGasTile()}
        ${this.renderBrentTile()}
        ${this.renderActiveDisruptionsTile()}
        ${this.renderFreshnessTile()}
        ${this.renderCrisisDayTile()}
      </div>
    `;
    this.setSafeContent(unsafeRawHtml(html, 'legacy Panel.setContent() migration'));
  }

  private renderHormuzTile(): string {
    const tile = this.state.hormuz;
    if (tile.status !== 'fulfilled' || !tile.value) {
      return tileHtml('Hormuz', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const status = tile.value.status as HormuzTrackerData['status'];
    const color = HORMUZ_STATUS_COLOR[status] ?? '#7f8c8d';
    const label = HORMUZ_STATUS_LABEL[status] ?? tile.value.status;
    return tileHtml('Hormuz', label, color);
  }

  private renderEuGasTile(): string {
    const tile = this.state.euGas;
    if (tile.status !== 'fulfilled' || !tile.value) {
      return tileHtml('EU Gas', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const fill = tile.value.fillPct.toFixed(0);
    const color = tile.value.fillPct < 30 ? '#e74c3c' : tile.value.fillPct < 50 ? '#f39c12' : '#27ae60';
    return tileHtml('EU Gas', `${fill}%`, color);
  }

  private renderBrentTile(): string {
    const tile = this.state.brent;
    if (tile.status !== 'fulfilled' || !tile.value) {
      return tileHtml('Brent', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const price = `$${tile.value.price.toFixed(2)}`;
    const change = tile.value.change;
    const sign = change >= 0 ? '+' : '';
    const deltaText = `${sign}${change.toFixed(2)}%`;
    const color = change >= 0 ? '#e74c3c' : '#27ae60';
    return tileHtml('Brent', price, color, '', deltaText);
  }

  private renderActiveDisruptionsTile(): string {
    const tile = this.state.activeDisruptions;
    if (tile.status !== 'fulfilled' || !tile.value) {
      return tileHtml('Active disruptions', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const n = tile.value.count;
    const color = n === 0 ? '#27ae60' : n < 5 ? '#f39c12' : '#e74c3c';
    return tileHtml('Active disruptions', String(n), color);
  }

  private renderFreshnessTile(): string {
    const tiles = [this.state.hormuz, this.state.euGas, this.state.brent, this.state.activeDisruptions];
    const fetchedAts = tiles
      .map(tile => tile.fetchedAt)
      .filter((v): v is number => typeof v === 'number');
    if (fetchedAts.length === 0) {
      return tileHtml('Updated', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const youngest = Math.max(...fetchedAts);
    const ageMin = Math.floor((Date.now() - youngest) / 60_000);
    const label = ageMin <= 0 ? 'just now' : ageMin === 1 ? '1 min ago' : `${ageMin} min ago`;
    return tileHtml('Updated', label, '#7f8c8d');
  }

  private renderCrisisDayTile(): string {
    if (!Number.isFinite(CRISIS_START_MS)) {
      return tileHtml('Hormuz crisis', '—', '#7f8c8d', 'data-degraded="true"');
    }
    const days = Math.floor((Date.now() - CRISIS_START_MS) / 86_400_000);
    if (days < 0) {
      return tileHtml('Hormuz crisis', 'pending', '#7f8c8d');
    }
    return tileHtml('Hormuz crisis', `Day ${days}`, '#7f8c8d');
  }
}

function tileHtml(label: string, value: string, color: string, attrs = '', sub = ''): string {
  const subHtml = sub ? `<div class="ero-tile__sub" style="color:${color}">${escapeHtml(sub)}</div>` : '';
  return `
    <div class="ero-tile" ${attrs}>
      <div class="ero-tile__label">${escapeHtml(label)}</div>
      <div class="ero-tile__value" style="color:${color}">${escapeHtml(value)}</div>
      ${subHtml}
    </div>
  `;
}

let _riskOverviewStylesInjected = false;
function injectRiskOverviewStylesOnce(): void {
  if (_riskOverviewStylesInjected) return;
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.setAttribute('data-ero-styles', '');
  style.textContent = RISK_OVERVIEW_CSS;
  document.head.appendChild(style);
  _riskOverviewStylesInjected = true;
}

const RISK_OVERVIEW_CSS = `
  .ero-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    padding: 8px;
  }
  .ero-tile {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 10px 12px;
    min-height: 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .ero-tile__label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 4px;
  }
  .ero-tile__value {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.1;
  }
  .ero-tile__sub {
    font-size: 12px;
    margin-top: 2px;
  }
`;
