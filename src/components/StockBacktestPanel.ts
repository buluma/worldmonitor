import { Panel } from './Panel';
import type { StockBacktestResult } from '@/services/stock-backtest';
import { escapeHtml } from '@/utils/sanitize';
import { DEFAULT_MARKET_WATCHLIST, setMarketWatchlistEntries } from '@/services/market-watchlist';

function tone(value: number): string {
  if (value > 0) return '#8df0b2';
  if (value < 0) return '#ff8c8c';
  return 'var(--text-dim)';
}

function fmtPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export class StockBacktestPanel extends Panel {
  private readonly actionHandler: (event: Event) => void;

  constructor() {
    super({ id: 'stock-backtest', title: 'Stock Backtesting' });
    this.actionHandler = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const action = target?.closest<HTMLElement>('[data-stock-panel-action]')?.dataset.stockPanelAction;
      if (!action) return;
      if (action === 'starter') {
        this.showLoading('Applying starter watchlist...');
        setMarketWatchlistEntries(DEFAULT_MARKET_WATCHLIST);
        return;
      }
      if (action === 'customize') {
        window.dispatchEvent(new CustomEvent('wm:open-market-watchlist'));
      }
    };
    this.getElement().addEventListener('click', this.actionHandler);
  }

  public renderBacktests(items: StockBacktestResult[], source: 'live' | 'cached' = 'live'): void {
    if (items.length === 0) {
      this.setDataBadge('unavailable');
      this.showRetrying('No stock backtests available yet.');
      return;
    }

    this.setDataBadge(source, `${items.length} symbols`);

    const html = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-size:12px;color:var(--text-dim);line-height:1.5">
          Historical replay of the stock-analysis signal engine over recent daily bars.
        </div>
        ${items.map((item) => `
          <section style="border:1px solid var(--border);background:rgba(255,255,255,0.03);padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <strong style="font-size:16px;letter-spacing:-0.02em">${escapeHtml(item.name || item.symbol)}</strong>
                  <span style="font-size:11px;color:var(--text-dim);font-family:monospace;text-transform:uppercase">${escapeHtml(item.display || item.symbol)}</span>
                </div>
                <div style="margin-top:6px;font-size:12px;color:var(--text-dim);line-height:1.5">${escapeHtml(item.summary)}</div>
              </div>
              <div style="text-align:right;min-width:110px">
                <div style="font-size:18px;font-weight:700;color:${tone(item.avgSimulatedReturnPct)}">${escapeHtml(fmtPct(item.avgSimulatedReturnPct))}</div>
                <div style="font-size:11px;color:var(--text-dim)">Avg simulated return</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-size:11px">
              <div style="border:1px solid var(--border);padding:8px"><div style="color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">Win Rate</div><div style="margin-top:4px">${escapeHtml(fmtPct(item.winRate))}</div></div>
              <div style="border:1px solid var(--border);padding:8px"><div style="color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">Direction Accuracy</div><div style="margin-top:4px">${escapeHtml(fmtPct(item.directionAccuracy))}</div></div>
              <div style="border:1px solid var(--border);padding:8px"><div style="color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">Cumulative</div><div style="margin-top:4px;color:${tone(item.cumulativeSimulatedReturnPct)}">${escapeHtml(fmtPct(item.cumulativeSimulatedReturnPct))}</div></div>
              <div style="border:1px solid var(--border);padding:8px"><div style="color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em">Signals</div><div style="margin-top:4px">${escapeHtml(String(item.actionableEvaluations))}</div></div>
            </div>
            <div style="display:grid;gap:6px">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Recent Evaluations</div>
              ${item.evaluations.map((evaluation) => `
                <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid var(--border);background:rgba(255,255,255,0.02);font-size:11px">
                  <span>${escapeHtml(evaluation.signal)} · ${escapeHtml(evaluation.outcome)} · ${escapeHtml(fmtPct(evaluation.simulatedReturnPct))}</span>
                  <span style="color:var(--text-dim)">${escapeHtml(new Date(Number(evaluation.analysisAt)).toLocaleDateString())}</span>
                </div>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    `;

    this.setContent(html);
  }

  public showStarterEmptyState(message: string): void {
    this.clearDataBadge();
    this.setContent(`
      <div style="display:grid;gap:12px">
        <div style="font-size:12px;color:var(--text-dim);line-height:1.55">
          ${escapeHtml(message)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${DEFAULT_MARKET_WATCHLIST.map((entry) => `
            <span style="padding:5px 8px;border:1px solid var(--border);background:rgba(255,255,255,0.03);font-size:11px;font-family:monospace;color:var(--text-dim)">
              ${escapeHtml(entry.symbol)}
            </span>
          `).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" data-stock-panel-action="starter" class="panels-reset-layout" style="border-color:rgba(141,240,178,0.45);color:#8df0b2">
            Use Starter Watchlist
          </button>
          <button type="button" data-stock-panel-action="customize" class="panels-reset-layout">
            Customize Watchlist
          </button>
        </div>
      </div>
    `);
  }

  public override destroy(): void {
    this.getElement().removeEventListener('click', this.actionHandler);
    super.destroy();
  }
}
