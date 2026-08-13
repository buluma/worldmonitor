import { getResilienceScore, type ResilienceDomain, type ResilienceScoreResponse } from '@/services/resilience';
import { h, replaceChildren } from '@/utils/dom-utils';
import {
  type DimensionConfidence,
  RESILIENCE_VISUAL_LEVEL_COLORS,
  collectDimensionConfidences,
  formatBaselineStress,
  formatResilienceMethodologyHelpTitle,
  formatResilienceChange30d,
  formatResilienceConfidence,
  formatResilienceDataVersion,
  formatResilienceScoreInterval,
  getResilienceOverallDisplay,
  getImputationClassIcon,
  getImputationClassLabel,
  getResilienceDomainLabel,
  getResilienceTrendArrow,
  getResilienceVisualLevel,
  getStalenessIcon,
  getStalenessLabel,
  shouldRenderResilienceBaselineStress,
} from './resilience-widget-utils';

// Ported from koala73/main's ResilienceWidget.ts. This fork has no
// premium/paywall gating (see [[koala73-ports]] — "All pro/premium gates:
// removed"), so the auth-state/panel-gating machinery and the locked-preview
// CTA that gated this widget upstream are dropped entirely: the widget
// always renders the live score. The energy-mix hover detail (populated
// upstream from a separate Country Energy Profile feature this fork hasn't
// ported) is dropped too — the domain row just shows the bare score.
const METHODOLOGY_HELP_TITLE = formatResilienceMethodologyHelpTitle();

function normalizeCountryCode(countryCode: string | null | undefined): string | null {
  const normalized = String(countryCode || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

export class ResilienceWidget {
  private readonly element: HTMLElement;
  private currentCountryCode: string | null = null;
  private currentData: ResilienceScoreResponse | null = null;
  private loading = false;
  private errorMessage: string | null = null;
  private requestVersion = 0;

  constructor(countryCode?: string | null) {
    this.element = document.createElement('section');
    this.element.className = 'cdp-card resilience-widget';
    this.setCountryCode(countryCode ?? null);
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public setCountryCode(countryCode: string | null): void {
    const normalized = normalizeCountryCode(countryCode);
    if (normalized === this.currentCountryCode) return;

    this.currentCountryCode = normalized;
    this.currentData = null;
    this.errorMessage = null;
    this.loading = false;
    this.requestVersion += 1;

    if (!normalized) {
      this.render();
      return;
    }

    void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.currentCountryCode) {
      this.render();
      return;
    }

    const requestVersion = ++this.requestVersion;
    this.loading = true;
    this.errorMessage = null;
    this.render();

    try {
      const response = await getResilienceScore(this.currentCountryCode);
      if (requestVersion !== this.requestVersion) return;
      this.currentData = response;
      this.loading = false;
      this.errorMessage = null;
      this.render();
    } catch (error) {
      if (requestVersion !== this.requestVersion) return;
      this.loading = false;
      this.currentData = null;
      this.errorMessage = error instanceof Error ? error.message : 'Unable to load resilience score.';
      this.render();
    }
  }

  public destroy(): void {
    this.requestVersion += 1;
  }

  private render(): void {
    const body = this.renderBody();

    replaceChildren(
      this.element,
      h(
        'div',
        { className: 'resilience-widget__header' },
        h('h3', { className: 'cdp-card-title resilience-widget__title' }, 'Resilience Score'),
        h(
          'span',
          {
            className: 'resilience-widget__help',
            title: METHODOLOGY_HELP_TITLE,
            'aria-label': 'Resilience score methodology',
          },
          '?',
        ),
      ),
      body,
    );
  }

  private renderBody(): HTMLElement {
    if (!this.currentCountryCode) {
      return h('div', { className: 'cdp-card-body' }, this.makeEmpty('Resilience data loads when a country is selected.'));
    }

    if (this.loading) {
      return h('div', { className: 'cdp-card-body' }, this.makeLoading('Loading resilience score…'));
    }

    if (this.errorMessage) {
      return this.renderError(this.errorMessage);
    }

    if (!this.currentData) {
      return h('div', { className: 'cdp-card-body' }, this.makeEmpty('Resilience score unavailable.'));
    }

    return this.renderScoreCard(this.currentData);
  }

  private renderError(message: string): HTMLElement {
    return h(
      'div',
      { className: 'cdp-card-body resilience-widget__error' },
      h('div', { className: 'cdp-empty' }, message),
      h(
        'button',
        {
          type: 'button',
          className: 'cdp-action-btn resilience-widget__retry',
          onclick: () => void this.refresh(),
        },
        'Retry',
      ),
    );
  }

  private renderScoreCard(data: ResilienceScoreResponse): HTMLElement {
    const overallDisplay = getResilienceOverallDisplay(data);
    const levelColor = RESILIENCE_VISUAL_LEVEL_COLORS[overallDisplay.visualLevel];
    const scoreInterval = overallDisplay.hasScore ? formatResilienceScoreInterval(data.scoreInterval) : null;

    return h(
      'div',
      { className: 'cdp-card-body resilience-widget__body' },
      h(
        'div',
        { className: 'resilience-widget__overall' },
        this.renderBarBlock(
          overallDisplay.scoreForBar,
          levelColor,
          h(
            'div',
            { className: 'resilience-widget__overall-meta' },
            h('span', { className: 'resilience-widget__overall-score' }, overallDisplay.scoreLabel),
            ...(scoreInterval
              ? [h('span', {
                  className: 'resilience-widget__overall-interval',
                  title: scoreInterval.title,
                }, scoreInterval.label)]
              : []),
            h(
              'span',
              {
                className: 'resilience-widget__overall-level',
                style: { color: levelColor },
                title: overallDisplay.serverLevelLabel,
              },
              overallDisplay.visualLevelLabel,
            ),
            ...(overallDisplay.hasScore
              ? [h('span', { className: 'resilience-widget__overall-trend' }, `${getResilienceTrendArrow(data.trend)} ${data.trend}`)]
              : []),
          ),
        ),
      ),
      ...(shouldRenderResilienceBaselineStress(data, overallDisplay)
        ? [h(
            'div',
            { className: 'resilience-widget__baseline-stress' },
            h('span', { className: 'resilience-widget__baseline-stress-text' },
              formatBaselineStress(data.baselineScore, data.stressScore)),
          )]
        : []),
      h(
        'div',
        { className: 'resilience-widget__domains' },
        ...data.domains.map((domain) => this.renderDomainRow(domain)),
      ),
      this.renderDimensionConfidenceGrid(data),
      h(
        'div',
        { className: 'resilience-widget__footer' },
        h(
          'span',
          {
            className: `resilience-widget__confidence${data.lowConfidence ? ' resilience-widget__confidence--low' : ''}`,
            title: 'Coverage and imputation-based confidence signal.',
          },
          formatResilienceConfidence(data),
        ),
        h('span', { className: 'resilience-widget__delta' }, formatResilienceChange30d(data.change30d)),
        ...(() => {
          const dataVersionLabel = formatResilienceDataVersion(data.dataVersion);
          return dataVersionLabel
            ? [h(
                'span',
                {
                  className: 'resilience-widget__data-version',
                  title: 'Date the static-seed bundle was last refreshed. Individual live inputs (conflict events, sanctions, prices) can be newer — see the per-dimension freshness badge for those.',
                },
                dataVersionLabel,
              )]
            : [];
        })(),
      ),
    );
  }

  private renderDimensionConfidenceGrid(data: ResilienceScoreResponse): HTMLElement {
    const dimensions = collectDimensionConfidences(data.domains);
    return h(
      'div',
      {
        className: 'resilience-widget__dimension-grid',
        title: 'Per-dimension data coverage. Hover a cell for the coverage percentage and observation provenance.',
      },
      ...dimensions.map((dim) => this.renderDimensionConfidenceCell(dim)),
    );
  }

  private renderDimensionConfidenceCell(dim: DimensionConfidence): HTMLElement {
    const titleParts: string[] = [
      dim.absent ? `${dim.label}: no data` : `${dim.label}: ${dim.coveragePct}% coverage, ${dim.status}`,
    ];
    if (dim.imputationClass) titleParts.push(getImputationClassLabel(dim.imputationClass));
    if (dim.staleness) titleParts.push(getStalenessLabel(dim.staleness));
    const title = titleParts.join(' | ');

    const imputationClassName = dim.imputationClass
      ? `resilience-widget__dimension-imputation resilience-widget__dimension-imputation--${dim.imputationClass}`
      : 'resilience-widget__dimension-imputation';
    const freshnessClassName = dim.staleness
      ? `resilience-widget__dimension-freshness resilience-widget__dimension-freshness--${dim.staleness}`
      : 'resilience-widget__dimension-freshness';

    return h(
      'div',
      {
        className: `resilience-widget__dimension-cell resilience-widget__dimension-cell--${dim.status}`,
        title,
      },
      h('span', { className: 'resilience-widget__dimension-label' }, dim.label),
      h(
        'div',
        { className: 'resilience-widget__dimension-bar-track' },
        h('div', {
          className: 'resilience-widget__dimension-bar-fill',
          style: { width: `${dim.coveragePct}%` },
        }),
      ),
      h(
        'span',
        {
          className: imputationClassName,
          'aria-label': dim.imputationClass ? getImputationClassLabel(dim.imputationClass) : undefined,
        },
        dim.imputationClass ? getImputationClassIcon(dim.imputationClass) : '',
      ),
      h('span', { className: 'resilience-widget__dimension-pct' }, dim.absent ? 'n/a' : `${dim.coveragePct}%`),
      h(
        'span',
        {
          className: freshnessClassName,
          'aria-label': dim.staleness ? getStalenessLabel(dim.staleness) : undefined,
        },
        getStalenessIcon(dim.staleness),
      ),
    );
  }

  private renderDomainRow(domain: ResilienceDomain): HTMLElement {
    const score = clampScore(domain.score);
    const levelColor = RESILIENCE_VISUAL_LEVEL_COLORS[getResilienceVisualLevel(score)];

    return h(
      'div',
      { className: 'resilience-widget__domain-row' },
      h('span', { className: 'resilience-widget__domain-label' }, getResilienceDomainLabel(domain.id)),
      this.renderBarBlock(score, levelColor),
      h('span', { className: 'resilience-widget__domain-score' }, String(Math.round(score))),
    );
  }

  private renderBarBlock(score: number, color: string, trailing?: HTMLElement): HTMLElement {
    return h(
      'div',
      { className: 'resilience-widget__bar-block' },
      h(
        'div',
        { className: 'resilience-widget__bar-track' },
        h('div', {
          className: 'resilience-widget__bar-fill',
          style: {
            width: `${score}%`,
            background: color,
          },
        }),
      ),
      trailing ?? null,
    );
  }

  private makeLoading(text: string): HTMLElement {
    return h(
      'div',
      { className: 'cdp-loading-inline' },
      h('div', { className: 'cdp-loading-line' }),
      h('div', { className: 'cdp-loading-line cdp-loading-line-short' }),
      h('span', { className: 'cdp-loading-text' }, text),
    );
  }

  private makeEmpty(text: string): HTMLElement {
    return h('div', { className: 'cdp-empty' }, text);
  }
}
