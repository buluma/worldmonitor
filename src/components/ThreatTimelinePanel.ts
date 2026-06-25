import { Panel } from './Panel';
import { getServerInsights, type ServerInsightStory, type ServerInsights } from '@/services/insights-loader';
import { escapeHtml } from '@/utils/sanitize';

type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

const LEVEL_COLORS: Record<ThreatLevel, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
};

const LEVEL_ORDER: ThreatLevel[] = ['critical', 'high', 'medium', 'low', 'info'];

function classifyThreatLevel(story: ServerInsightStory): ThreatLevel {
  const raw = (story.threatLevel || '').toLowerCase();
  if (raw === 'critical' || story.importanceScore >= 90) return 'critical';
  if (raw === 'high' || story.importanceScore >= 70) return 'high';
  if (raw === 'medium' || story.importanceScore >= 50) return 'medium';
  if (raw === 'low' || story.importanceScore >= 30) return 'low';
  return 'info';
}

export class ThreatTimelinePanel extends Panel {
  constructor() {
    super({
      id: 'threat-timeline',
      title: 'Threat Timeline',
      showCount: false,
      infoTooltip: 'Threat-level distribution from intelligence insights.',
    });
    this.showLoading('Analyzing threats…');
  }

  public refresh(): void {
    const insights = getServerInsights();
    if (!insights || insights.topStories.length === 0) {
      this.setCount(0);
      this.setDataBadge('unavailable');
      this.setContent('<div class="threat-tl-empty">No recent threat metadata available.</div>');
      return;
    }
    this.renderInsights(insights);
  }

  private renderInsights(insights: ServerInsights): void {
    const stories = insights.topStories;
    const counts: Record<ThreatLevel, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const grouped: Record<ThreatLevel, ServerInsightStory[]> = { critical: [], high: [], medium: [], low: [], info: [] };

    for (const s of stories) {
      const level = classifyThreatLevel(s);
      counts[level]++;
      grouped[level].push(s);
    }

    const total = stories.length;
    const critHigh = counts.critical + counts.high;
    const activeDays = this.countActiveDays(insights);
    const trend = this.describeTrend(counts);

    this.setCount(total);
    this.setDataBadge(insights.status === 'ok' ? 'live' : 'cached', 'Insights snapshot');

    const barTotal = Math.max(total, 1);
    const barHtml = LEVEL_ORDER
      .filter(l => counts[l] > 0)
      .map(l => `<div class="threat-tl-bar-seg" style="width:${(counts[l] / barTotal * 100).toFixed(1)}%;background:${LEVEL_COLORS[l]}" title="${l}: ${counts[l]}"></div>`)
      .join('');

    const legendHtml = LEVEL_ORDER
      .map(l => `<span class="threat-tl-legend-item"><span class="threat-tl-swatch" style="background:${LEVEL_COLORS[l]}"></span>${l} <strong>${counts[l]}</strong></span>`)
      .join('');

    const groupsHtml = LEVEL_ORDER
      .filter(l => grouped[l].length > 0)
      .map(l => {
        const items = grouped[l].slice(0, 5).map(s =>
          `<div class="threat-tl-item"><span class="threat-tl-item-dot" style="background:${LEVEL_COLORS[l]}"></span><span class="threat-tl-item-title">${escapeHtml(s.primaryTitle)}</span><span class="threat-tl-item-cat">${escapeHtml(s.category)}</span></div>`
        ).join('');
        return `<div class="threat-tl-group"><div class="threat-tl-group-label" style="color:${LEVEL_COLORS[l]}">${l.toUpperCase()} (${grouped[l].length})</div>${items}</div>`;
      })
      .join('');

    this.setContent(`
      <div class="threat-tl-panel">
        <div class="threat-tl-summary">
          <div class="threat-tl-stat"><span class="threat-tl-stat-val">${critHigh}</span><span class="threat-tl-stat-lbl">Critical/\nhigh</span></div>
          <div class="threat-tl-stat"><span class="threat-tl-stat-val">${activeDays}</span><span class="threat-tl-stat-lbl">Active\ndays</span></div>
          <div class="threat-tl-trend ${trend.cls}"><span class="threat-tl-trend-icon">${trend.icon}</span> ${escapeHtml(trend.label)}</div>
        </div>
        <div class="threat-tl-bar">${barHtml}</div>
        <div class="threat-tl-legend">${legendHtml}</div>
        <div class="threat-tl-groups">${groupsHtml}</div>
        <div class="threat-tl-footer">${total} insight${total === 1 ? '' : 's'}</div>
      </div>
      <style>
        .threat-tl-panel{font-size:11px;padding:8px 12px}
        .threat-tl-empty{color:var(--text-dim);text-align:center;padding:24px 12px;font-size:12px}
        .threat-tl-summary{display:flex;gap:12px;align-items:center;margin-bottom:10px}
        .threat-tl-stat{display:flex;flex-direction:column;align-items:center;min-width:48px}
        .threat-tl-stat-val{font-size:22px;font-weight:700;line-height:1;color:var(--text)}
        .threat-tl-stat-lbl{font-size:9px;color:var(--text-dim);text-align:center;white-space:pre-line;margin-top:2px}
        .threat-tl-trend{margin-left:auto;font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px}
        .threat-tl-trend.worsening{color:#ef4444}
        .threat-tl-trend.stable{color:#6b7280}
        .threat-tl-trend.improving{color:#22c55e}
        .threat-tl-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px;background:var(--overlay-light)}
        .threat-tl-bar-seg{min-width:4px}
        .threat-tl-legend{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:10px;color:var(--text-dim)}
        .threat-tl-legend-item{display:flex;align-items:center;gap:3px}
        .threat-tl-swatch{width:8px;height:8px;border-radius:2px;display:inline-block}
        .threat-tl-groups{display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto}
        .threat-tl-group-label{font-size:9px;font-weight:700;letter-spacing:0.5px;margin-bottom:4px}
        .threat-tl-item{display:flex;align-items:center;gap:6px;padding:2px 0}
        .threat-tl-item-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .threat-tl-item-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
        .threat-tl-item-cat{font-size:9px;color:var(--text-dim);flex-shrink:0}
        .threat-tl-footer{font-size:9px;color:var(--text-dim);margin-top:8px;text-align:right}
      </style>
    `);
  }

  private countActiveDays(insights: ServerInsights): number {
    const dates = new Set<string>();
    const gen = insights.generatedAt;
    if (gen) dates.add(gen.slice(0, 10));
    for (const s of insights.topStories) {
      if (s.isAlert) dates.add(new Date().toISOString().slice(0, 10));
    }
    return Math.max(dates.size, 1);
  }

  private describeTrend(counts: Record<ThreatLevel, number>): { label: string; icon: string; cls: string } {
    const critHigh = counts.critical + counts.high;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return { label: 'No data', icon: '—', cls: 'stable' };
    const ratio = critHigh / total;
    if (ratio >= 0.5) return { label: 'Worsening', icon: '⬆', cls: 'worsening' };
    if (ratio >= 0.2) return { label: 'Stable', icon: '➡', cls: 'stable' };
    return { label: 'Improving', icon: '⬇', cls: 'improving' };
  }
}
