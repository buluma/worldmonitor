import { escapeHtml } from '@/utils/sanitize';
import { shuffle } from '@/utils';
import { t } from '@/services/i18n';
import { trackSearchUsed } from '@/services/analytics';
import { getAllCommands, type Command } from '@/config/commands';
import { isMobileDevice } from '@/utils';
import {
  ALL_CHANNEL_TIP_KEYS,
  SEARCH_SCOPES,
  commandMatchesSearchScope,
  idleChipCommandIds,
  panelCommandTargetId,
  resolveIdleSelectionTerm,
  resultMatchesSearchScope,
  type SearchScope,
} from '@/components/search-scope';

interface CommandResult {
  command: Command;
  score: number;
}

const CATEGORY_KEYS: Record<string, string> = {
  navigate: 'commands.categories.navigate',
  layers: 'commands.categories.layers',
  panels: 'commands.categories.panels',
  view: 'commands.categories.view',
  actions: 'commands.categories.actions',
  country: 'commands.categories.country',
};

const SCOPE_ICONS: Record<SearchScope, string> = {
  all: '⌘',
  signals: '◉',
  map: '⌖',
  panels: '▦',
  actions: '⚡',
};

const SCOPE_LABELS: Record<SearchScope, string> = {
  all: 'All Intel',
  signals: 'Signals',
  map: 'Map',
  panels: 'Panels',
  actions: 'Actions',
};

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function resolveCommandLabel(cmd: Command): string {
  const colonIdx = cmd.id.indexOf(':');
  if (colonIdx === -1) return cmd.label;
  const prefix = cmd.id.slice(0, colonIdx);
  const action = cmd.id.slice(colonIdx + 1);

  switch (prefix) {
    case 'nav':
      return `${t('commands.prefixes.map')}: ${t('commands.regions.' + action, { defaultValue: cmd.label })}`;
    case 'country-map':
      return `${t('commands.prefixes.map')}: ${cmd.label}`;
    case 'panel': {
      const panelName = t('panels.' + kebabToCamel(action), { defaultValue: cmd.label });
      return `${t('commands.prefixes.panel')}: ${panelName}`;
    }
    case 'country':
      return `${t('commands.prefixes.brief')}: ${cmd.label}`;
    default: {
      const i18nKey = `commands.labels.${cmd.id.replace(':', '.')}`;
      const resolved = t(i18nKey, { defaultValue: '' });
      return resolved || cmd.label;
    }
  }
}

function resolveCategoryLabel(cmd: Command): string {
  const key = CATEGORY_KEYS[cmd.category];
  return key ? t(key, { defaultValue: cmd.category }) : cmd.category;
}

export type SearchResultType = 'country' | 'news' | 'hotspot' | 'market' | 'prediction' | 'conflict' | 'base' | 'pipeline' | 'cable' | 'datacenter' | 'earthquake' | 'outage' | 'nuclear' | 'irradiator' | 'techcompany' | 'ailab' | 'startup' | 'techevent' | 'techhq' | 'accelerator' | 'exchange' | 'financialcenter' | 'centralbank' | 'commodityhub';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  data: unknown;
}

interface SearchableSource {
  type: SearchResultType;
  items: { id: string; title: string; subtitle?: string; data: unknown }[];
}

const RECENT_SEARCHES_KEY = 'worldmonitor_recent_searches';
const MAX_RECENT = 8;
const MAX_RESULTS = 24;
const MAX_COMMANDS = 5;

interface SearchModalOptions {
  placeholder?: string;
}

export class SearchModal {
  private container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private chipsContainer: HTMLElement | null = null;
  private scopeContainer: HTMLElement | null = null;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private viewportHandler: (() => void) | null = null;
  private sources: SearchableSource[] = [];
  private results: SearchResult[] = [];
  private commandResults: CommandResult[] = [];
  private selectedIndex = 0;
  private recentSearches: string[] = [];
  private onSelect?: (result: SearchResult) => void;
  private onCommand?: (command: Command) => void;
  private placeholder: string;
  private activePanelIds: Set<string> = new Set();
  private isMobile: boolean;
  private activeScope: SearchScope = 'all';
  /** Idle-launch example strings for the current scope — Enter with no live results picks these up. */
  private quickLaunchExamples: string[] = [];
  /** When true, results area shows the full command list (opt-in). Sourced from getAllCommands(); no separate list to maintain. */
  private showingAllCommands = false;

  constructor(container: HTMLElement, options?: SearchModalOptions) {
    this.container = container;
    this.placeholder = options?.placeholder || t('modals.search.placeholder');
    this.isMobile = isMobileDevice();
    this.loadRecentSearches();
  }

  public registerSource(type: SearchResultType, items: SearchableSource['items']): void {
    const existingIndex = this.sources.findIndex(s => s.type === type);
    if (existingIndex >= 0) {
      this.sources[existingIndex] = { type, items };
    } else {
      this.sources.push({ type, items });
    }
    this.updateIndexMetrics();
  }

  public setOnSelect(callback: (result: SearchResult) => void): void {
    this.onSelect = callback;
  }

  public setOnCommand(callback: (command: Command) => void): void {
    this.onCommand = callback;
  }

  public setActivePanels(panelIds: string[]): void {
    this.activePanelIds = new Set(panelIds);
    this.updateIndexMetrics();
  }

  /** A panel command is shown iff it's currently active — matches this fork's simple (no add-a-panel) model. */
  private isPanelCommandVisible(panelId: string): boolean {
    return this.activePanelIds.size === 0 || this.activePanelIds.has(panelId);
  }

  public open(): void {
    if (this.closeTimeoutId) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
      this.overlay?.remove();
      this.overlay = null;
    }
    if (this.overlay) return;
    this.isMobile = isMobileDevice();
    this.activeScope = 'all';
    this.createModal();
    this.input?.focus();
    this.showingAllCommands = false;
    this.showRecentOrEmpty();
    if (this.isMobile) this.renderChips();
  }

  public close(): void {
    if (this.viewportHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.viewportHandler);
      this.viewportHandler = null;
    }
    if (this.overlay) {
      this.overlay.classList.remove('open');
      const remove = () => {
        this.overlay?.remove();
        this.overlay = null;
        this.input = null;
        this.resultsList = null;
        this.chipsContainer = null;
        this.scopeContainer = null;
        this.results = [];
        this.commandResults = [];
        this.selectedIndex = 0;
      };
      if (this.isMobile) {
        this.closeTimeoutId = setTimeout(() => {
          this.closeTimeoutId = null;
          remove();
        }, 300);
      } else {
        remove();
      }
    }
  }

  public isOpen(): boolean {
    return this.overlay !== null;
  }

  private createModal(): void {
    this.overlay = document.createElement('div');

    if (this.isMobile) {
      this.overlay.className = 'search-overlay search-mobile';
      this.overlay.innerHTML = `
        <div class="search-sheet">
          <div class="search-sheet-handle"></div>
          <div class="search-mobile-ident">
            <span>WM // COMMAND DECK</span>
            <span class="search-index-state"><i></i> LIVE</span>
          </div>
          <div class="search-sheet-header">
            <span class="search-sheet-icon"></span>
            <input type="text" class="search-input" placeholder="${this.placeholder}" autofocus />
            <button class="search-sheet-cancel" aria-label="Close">×</button>
          </div>
          ${this.renderScopeMarkup()}
          <div class="search-sheet-chips"></div>
          <div class="search-results"></div>
        </div>
      `;

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      this.overlay.querySelector('.search-sheet-cancel')?.addEventListener('click', () => this.close());

      this.chipsContainer = this.overlay.querySelector('.search-sheet-chips');

      this.container.appendChild(this.overlay);
      requestAnimationFrame(() => this.overlay?.classList.add('open'));

      const sheet = this.overlay.querySelector('.search-sheet') as HTMLElement | null;
      if (sheet && window.visualViewport) {
        const vv = window.visualViewport;
        this.viewportHandler = () => {
          if (!sheet.isConnected) return;
          sheet.style.maxHeight = `${vv.height * 0.85}px`;
        };
        vv.addEventListener('resize', this.viewportHandler);
      }
    } else {
      this.overlay.className = 'search-overlay';
      this.overlay.innerHTML = `
        <div class="search-modal">
          <div class="search-command-topline">
            <div class="search-command-ident">
              <span class="search-command-mark"><i></i></span>
              <span>WM // INTELLIGENCE COMMAND DECK</span>
              <span class="search-index-state"><i></i> INDEX ONLINE</span>
            </div>
            <div class="search-command-metrics">
              <span><strong data-search-entity-count>${this.getIndexedEntityCount()}</strong> SIGNALS</span>
              <span><strong data-search-command-count>${this.getVisibleCommandCount()}</strong> OPS</span>
            </div>
          </div>
          <div class="search-header">
            <span class="search-icon"></span>
            <input type="text" class="search-input" placeholder="${this.placeholder}" autofocus />
            <kbd class="search-kbd">ESC</kbd>
          </div>
          ${this.renderScopeMarkup()}
          <div class="search-results"></div>
          <div class="search-footer">
            <span class="search-footer-ready"><i></i> READY FOR TASKING</span>
            <span><kbd>↑↓</kbd> ${t('modals.search.navigate')}</span>
            <span><kbd>↵</kbd> ${t('modals.search.select')}</span>
            <span><kbd>esc</kbd> ${t('modals.search.close')}</span>
          </div>
        </div>
      `;

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      this.container.appendChild(this.overlay);
    }

    this.input = this.overlay.querySelector('.search-input');
    this.resultsList = this.overlay.querySelector('.search-results');
    this.scopeContainer = this.overlay.querySelector('.search-scope-rail');

    this.input?.addEventListener('input', () => this.handleSearch());
    this.input?.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.scopeContainer?.querySelectorAll<HTMLButtonElement>('[data-search-scope]').forEach((button) => {
      button.addEventListener('click', () => {
        const scope = button.dataset.searchScope as SearchScope | undefined;
        if (scope && (SEARCH_SCOPES as readonly string[]).includes(scope)) this.setActiveScope(scope);
      });
    });
  }

  private renderScopeMarkup(): string {
    const buttons = SEARCH_SCOPES.map((scope) => `
      <button
        type="button"
        class="search-scope${scope === this.activeScope ? ' active' : ''}"
        data-search-scope="${scope}"
        aria-pressed="${scope === this.activeScope}"
      ><span>${SCOPE_ICONS[scope]}</span>${escapeHtml(SCOPE_LABELS[scope].toUpperCase())}</button>
    `).join('');

    return `<div class="search-scope-rail">${buttons}</div>`;
  }

  private setActiveScope(scope: SearchScope): void {
    if (this.activeScope === scope) return;
    this.activeScope = scope;
    this.scopeContainer?.querySelectorAll<HTMLButtonElement>('[data-search-scope]').forEach((button) => {
      const isActive = button.dataset.searchScope === scope;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    this.selectedIndex = 0;
    if (this.input?.value.trim()) this.handleSearch();
    else this.showRecentOrEmpty();
    if (this.isMobile) this.renderChips(this.input?.value.trim());
  }

  private getIndexedEntityCount(): number {
    return this.sources.reduce((count, source) => count + source.items.length, 0);
  }

  private getVisibleCommandCount(): number {
    return getAllCommands().filter((command) => {
      const panelId = panelCommandTargetId(command.id);
      if (panelId && !this.isPanelCommandVisible(panelId)) return false;
      return true;
    }).length;
  }

  private updateIndexMetrics(): void {
    const entityCount = this.overlay?.querySelector<HTMLElement>('[data-search-entity-count]');
    const commandCount = this.overlay?.querySelector<HTMLElement>('[data-search-command-count]');
    if (entityCount) entityCount.textContent = String(this.getIndexedEntityCount());
    if (commandCount) commandCount.textContent = String(this.getVisibleCommandCount());
  }

  private matchCommands(query: string): CommandResult[] {
    if (query.length < 2) return [];
    const matched: CommandResult[] = [];
    for (const cmd of getAllCommands()) {
      if (!commandMatchesSearchScope(this.activeScope, cmd.category)) continue;
      const panelId = panelCommandTargetId(cmd.id);
      if (panelId && !this.isPanelCommandVisible(panelId)) continue;
      const label = resolveCommandLabel(cmd).toLowerCase();
      const allTerms = [...cmd.keywords, label];
      let bestScore = 0;
      for (const term of allTerms) {
        if (term.includes(query) || (term.length >= 3 && query.includes(term))) {
          const isExact = term === query;
          const isPrefix = term.startsWith(query);
          const score = isExact ? 3 : isPrefix ? 2 : 1;
          if (score > bestScore) bestScore = score;
        }
      }
      if (bestScore > 0) {
        matched.push({ command: cmd, score: bestScore });
      }
    }
    return matched.sort((a, b) => b.score - a.score).slice(0, MAX_COMMANDS);
  }

  private handleSearch(): void {
    const query = this.input?.value.trim().toLowerCase() || '';

    if (!query) {
      this.showingAllCommands = false;
      this.commandResults = [];
      this.showRecentOrEmpty();
      if (this.isMobile) this.renderChips();
      return;
    }

    this.commandResults = this.matchCommands(query);

    const byType = new Map<SearchResultType, (SearchResult & { _score: number })[]>();

    for (const source of this.sources) {
      if (!resultMatchesSearchScope(this.activeScope, source.type)) continue;
      for (const item of source.items) {
        const titleLower = item.title.toLowerCase();
        const subtitleLower = item.subtitle?.toLowerCase() || '';

        if (titleLower.includes(query) || subtitleLower.includes(query)) {
          const isPrefix = titleLower.startsWith(query) || subtitleLower.startsWith(query);
          const result = {
            type: source.type,
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            data: item.data,
            _score: isPrefix ? 2 : 1,
          } as SearchResult & { _score: number };

          if (!byType.has(source.type)) byType.set(source.type, []);
          byType.get(source.type)!.push(result);
        }
      }
    }

    const priority: SearchResultType[] = [
      'news', 'prediction', 'market', 'earthquake', 'outage',
      'conflict', 'hotspot', 'country',
      'base', 'pipeline', 'cable', 'datacenter', 'nuclear', 'irradiator',
      'techcompany', 'ailab', 'startup', 'techevent', 'techhq', 'accelerator'
    ];

    const maxResults = this.isMobile ? 5 : MAX_RESULTS;
    this.results = [];
    for (const type of priority) {
      const matches = byType.get(type) || [];
      matches.sort((a, b) => b._score - a._score);
      const limit = this.isMobile ? 2 : (type === 'news' ? 6 : type === 'country' ? 4 : 3);
      this.results.push(...matches.slice(0, limit));
      if (this.results.length >= maxResults) break;
    }
    this.results = this.results.slice(0, maxResults);

    trackSearchUsed(query.length, this.results.length + this.commandResults.length);
    this.selectedIndex = 0;
    this.renderResults();
    if (this.isMobile) this.renderChips(query);
  }

  private showRecentOrEmpty(): void {
    this.results = [];

    if (this.showingAllCommands) {
      this.renderAllCommandsList();
      return;
    }

    if (this.activeScope === 'all' && this.recentSearches.length > 0) {
      this.renderRecent();
    } else {
      this.renderEmpty();
    }
  }

  private renderRecent(): void {
    if (!this.resultsList) return;

    this.resultsList.innerHTML = `<div class="search-section-header">${t('modals.search.recent')}</div>`;

    this.recentSearches.forEach((term, i) => {
      const item = document.createElement('div');
      item.className = `search-result-item recent${i === this.selectedIndex ? ' selected' : ''}`;
      item.dataset.recent = term;

      const icon = document.createElement('span');
      icon.className = 'search-result-icon';
      icon.textContent = '🕐';

      const title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = term;

      item.appendChild(icon);
      item.appendChild(title);

      item.addEventListener('click', () => {
        if (this.input) this.input.value = term;
        this.handleSearch();
      });

      this.resultsList?.appendChild(item);
    });

    this.appendSeeAllCommandsLink();
  }

  private renderEmpty(): void {
    if (!this.resultsList) return;

    const tipMeta: Record<string, { icon: string }> = {
      'commands.tips.map': { icon: '⌖' },
      'commands.tips.panel': { icon: '▦' },
      'commands.tips.brief': { icon: '◉' },
      'commands.tips.layers': { icon: '⚡' },
      'commands.tips.time': { icon: '⏱️' },
      'commands.tips.settings': { icon: '⚙️' },
    };
    const toTip = (key: string) => ({
      icon: tipMeta[key]?.icon ?? '•',
      key,
      exampleKey: `${key}Example`,
    });
    const allChannelTips = ALL_CHANNEL_TIP_KEYS.map((key) => toTip(key));
    const allTips: Record<SearchScope, { icon: string; key: string; exampleKey: string }[]> = {
      all: allChannelTips,
      signals: [toTip('commands.tips.brief')],
      map: [
        toTip('commands.tips.map'),
        { icon: '◈', key: 'commands.tips.layers', exampleKey: 'commands.tips.layersExample' },
      ],
      panels: [toTip('commands.tips.panel')],
      actions: [
        toTip('commands.tips.time'),
        toTip('commands.tips.settings'),
      ],
    };

    // All-channel keeps the original shuffled pick (variety on repeat opens);
    // scoped channels show their fixed, task-focused set in a stable order.
    const tips = this.activeScope === 'all'
      ? shuffle(allTips.all).slice(0, this.isMobile ? 2 : 4)
      : allTips[this.activeScope].slice(0, this.isMobile ? 2 : 4);
    this.quickLaunchExamples = tips.map((tip) => t(tip.exampleKey));

    let html = `
      <div class="search-section-header search-launch-header">
        <span>${t('modals.search.empty')}</span>
        <span>${escapeHtml(SCOPE_LABELS[this.activeScope])} channel</span>
      </div>
      <div class="search-launch-grid">`;
    tips.forEach((tip, i) => {
      const example = t(tip.exampleKey);
      html += `
        <div class="search-result-item tip-item${i === this.selectedIndex ? ' selected' : ''}" data-tip-example="${escapeHtml(example)}">
          <span class="search-result-icon">${tip.icon}</span>
          <div class="search-result-content">
            <div class="search-result-title">${escapeHtml(t(tip.key))}</div>
            <div class="search-result-subtitle">${escapeHtml(example)}</div>
          </div>
          <span class="search-launch-arrow">→</span>
        </div>`;
    });
    html += '</div>';

    this.resultsList.innerHTML = html;

    this.resultsList.querySelectorAll('.tip-item').forEach((el) => {
      el.addEventListener('click', () => {
        const example = (el as HTMLElement).dataset.tipExample || '';
        if (this.input) {
          this.input.value = example;
          this.handleSearch();
        }
      });
    });

    this.appendSeeAllCommandsLink();
  }

  private appendSeeAllCommandsLink(): void {
    if (!this.resultsList) return;
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'search-all-commands-link';
    link.textContent = t('modals.search.seeAllCommands');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      this.showingAllCommands = true;
      this.renderAllCommandsList();
    });
    const wrap = document.createElement('div');
    wrap.className = 'search-all-commands-wrap';
    wrap.appendChild(link);
    this.resultsList.appendChild(wrap);
  }

  /** Renders the full command list by category. Commands are sourced from getAllCommands(); no separate list to maintain. */
  private renderAllCommandsList(): void {
    if (!this.resultsList) return;

    const allCommands = getAllCommands();
    const commands = allCommands.filter(cmd => {
      const panelId = panelCommandTargetId(cmd.id);
      if (panelId && !this.isPanelCommandVisible(panelId)) return false;
      return true;
    });

    const categoryOrder: Command['category'][] = ['navigate', 'layers', 'panels', 'view', 'actions', 'country'];
    const byCategory = new Map<Command['category'], Command[]>();
    for (const cat of categoryOrder) byCategory.set(cat, []);
    for (const cmd of commands) {
      const list = byCategory.get(cmd.category);
      if (list) list.push(cmd);
    }

    let html = `
      <div class="search-section-header search-command-list-back">
        <a href="#" class="search-all-commands-back">${escapeHtml(t('modals.search.hideCommandList'))}</a>
      </div>`;

    for (const category of categoryOrder) {
      const list = byCategory.get(category) || [];
      if (list.length === 0) continue;
      const first = list[0];
      if (!first) continue;
      const label = resolveCategoryLabel(first);
      html += `<details class="search-command-category" open>`;
      html += `<summary class="search-command-category-summary">${escapeHtml(label)}</summary>`;
      html += `<div class="search-command-category-list">`;
      for (const cmd of list) {
        html += `
          <div class="search-result-item command-item" data-command="${escapeHtml(cmd.id)}">
            <span class="search-result-icon">${escapeHtml(cmd.icon)}</span>
            <div class="search-result-content">
              <div class="search-result-title">${escapeHtml(resolveCommandLabel(cmd))}</div>
            </div>
          </div>`;
      }
      html += `</div></details>`;
    }

    this.resultsList.innerHTML = html;

    const backLink = this.resultsList.querySelector('.search-all-commands-back');
    backLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showingAllCommands = false;
      this.showRecentOrEmpty();
    });

    this.resultsList.querySelectorAll('.search-command-category .command-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.command;
        const command = getAllCommands().find(c => c.id === id);
        if (command) {
          this.onCommand?.(command);
          this.close();
        }
      });
    });
  }

  private get totalResultCount(): number {
    return this.commandResults.length + this.results.length;
  }

  private renderResults(): void {
    if (!this.resultsList) return;

    if (this.commandResults.length === 0 && this.results.length === 0) {
      this.resultsList.innerHTML = `
        <div class="search-empty">
          <div class="search-empty-icon">∅</div>
          <div>${t('modals.search.noResults')}</div>
        </div>
      `;
      return;
    }

    const icons: Record<SearchResultType, string> = {
      country: '\u{1F3F3}️',
      news: '\u{1F4F0}',
      hotspot: '\u{1F4CD}',
      market: '\u{1F4C8}',
      prediction: '\u{1F3AF}',
      conflict: '⚔️',
      base: '\u{1F3DB}️',
      pipeline: '\u{1F6E2}',
      cable: '\u{1F310}',
      datacenter: '\u{1F5A5}️',
      earthquake: '\u{1F30D}',
      outage: '\u{1F4E1}',
      nuclear: '☢️',
      irradiator: '⚛️',
      techcompany: '\u{1F3E2}',
      ailab: '\u{1F9E0}',
      startup: '\u{1F680}',
      techevent: '\u{1F4C5}',
      techhq: '\u{1F984}',
      accelerator: '\u{1F680}',
      exchange: '\u{1F3DB}️',
      financialcenter: '\u{1F4B0}',
      centralbank: '\u{1F3E6}',
      commodityhub: '\u{1F4E6}',
    };

    let html = '';
    let globalIndex = 0;

    if (this.commandResults.length > 0) {
      html += `<div class="search-section-header">${t('modals.search.commands')}</div>`;
      for (const { command } of this.commandResults) {
        html += `
          <div class="search-result-item command-item ${globalIndex === this.selectedIndex ? 'selected' : ''}" data-index="${globalIndex}" data-command="${command.id}">
            <span class="search-result-icon">${command.icon}</span>
            <div class="search-result-content">
              <div class="search-result-title">${escapeHtml(resolveCommandLabel(command))}</div>
            </div>
            <span class="search-result-type">${escapeHtml(resolveCategoryLabel(command))}</span>
          </div>`;
        globalIndex++;
      }
      if (this.results.length > 0) {
        html += `<div class="search-section-header">${t('modals.search.results')}</div>`;
      }
    }

    for (const result of this.results) {
      html += `
        <div class="search-result-item ${globalIndex === this.selectedIndex ? 'selected' : ''}" data-index="${globalIndex}">
          <span class="search-result-icon">${icons[result.type]}</span>
          <div class="search-result-content">
            <div class="search-result-title">${this.highlightMatch(result.title)}</div>
            ${result.subtitle ? `<div class="search-result-subtitle">${escapeHtml(result.subtitle)}</div>` : ''}
          </div>
          <span class="search-result-type">${escapeHtml(t(`modals.search.types.${result.type}`) || result.type)}</span>
        </div>`;
      globalIndex++;
    }

    this.resultsList.innerHTML = html;

    this.resultsList.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10);
        this.selectResult(index);
      });
    });
  }

  private renderChips(query?: string): void {
    if (!this.chipsContainer) return;
    if (query && query.length >= 1) {
      this.chipsContainer.innerHTML = '';
      return;
    }

    const commands = getAllCommands();
    const chipIds = idleChipCommandIds(this.activeScope, commands);
    const chips = chipIds.flatMap((id) => {
      const cmd = commands.find((c) => c.id === id);
      if (!cmd) return [];
      const label = resolveCommandLabel(cmd);
      return [{ label, value: label.toLowerCase() }];
    });

    this.chipsContainer.innerHTML = chips.map(c =>
      `<button class="search-chip" data-value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</button>`
    ).join('');

    this.chipsContainer.querySelectorAll('.search-chip').forEach(el => {
      el.addEventListener('click', () => {
        const val = (el as HTMLElement).dataset.value || '';
        if (this.input) {
          this.input.value = val;
          this.handleSearch();
        }
      });
    });
  }

  private highlightMatch(text: string): string {
    const query = this.input?.value.trim() || '';
    const escapedText = escapeHtml(text);
    if (!query) return escapedText;

    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  }

  private handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        e.preventDefault();
        this.selectResult(this.selectedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  private moveSelection(delta: number): void {
    const idleItemCount = this.activeScope === 'all' && this.recentSearches.length > 0
      ? this.recentSearches.length
      : this.quickLaunchExamples.length;
    const max = this.totalResultCount || idleItemCount;
    if (max === 0) return;

    this.selectedIndex = (this.selectedIndex + delta + max) % max;
    this.updateSelection();
  }

  private updateSelection(): void {
    if (!this.resultsList) return;

    this.resultsList.querySelectorAll('.search-result-item').forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
    });

    const selected = this.resultsList.querySelector('.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private selectResult(index: number): void {
    if (this.totalResultCount === 0) {
      const inputEmpty = !(this.input?.value.trim());
      const term = resolveIdleSelectionTerm(
        this.activeScope,
        this.recentSearches,
        this.quickLaunchExamples,
        index,
        inputEmpty,
      );
      if (term && this.input) {
        this.input.value = term;
        this.handleSearch();
      }
      return;
    }

    if (index < this.commandResults.length) {
      const cmd = this.commandResults[index]?.command;
      if (cmd) {
        this.close();
        this.onCommand?.(cmd);
        return;
      }
    }

    const entityIndex = index - this.commandResults.length;
    const result = this.results[entityIndex];
    if (!result) return;

    this.saveRecentSearch(this.input?.value.trim() || '');
    this.close();
    this.onSelect?.(result);
  }

  private loadRecentSearches(): void {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      this.recentSearches = stored ? JSON.parse(stored) : [];
    } catch {
      this.recentSearches = [];
    }
  }

  private saveRecentSearch(term: string): void {
    if (!term || term.length < 2) return;

    this.recentSearches = [
      term,
      ...this.recentSearches.filter(t => t !== term)
    ].slice(0, MAX_RECENT);

    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(this.recentSearches));
    } catch {
      // Storage full, ignore
    }
  }
}
