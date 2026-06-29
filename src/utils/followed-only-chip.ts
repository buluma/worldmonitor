import {
  getFollowed,
  subscribe,
  isFollowFeatureEnabled,
} from '@/services/followed-countries';
import { escapeHtml } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

export interface FollowedOnlyChipProps {
  panelId: string;
  onChange?: (active: boolean) => void;
  label?: string;
}

export interface FollowedOnlyChipHandle {
  html: string;
  attach: (host: HTMLElement) => () => void;
  isActive: () => boolean;
}

const STORAGE_KEY_PREFIX = 'wm-followed-only-filter-';

function storageKeyFor(panelId: string): string {
  return `${STORAGE_KEY_PREFIX}${panelId}`;
}

function readActive(panelId: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(storageKeyFor(panelId)) === '1';
  } catch {
    return false;
  }
}

function writeActive(panelId: string, active: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (active) {
      localStorage.setItem(storageKeyFor(panelId), '1');
    } else {
      localStorage.removeItem(storageKeyFor(panelId));
    }
  } catch {
    /* swallow */
  }
}

function readEffectiveActive(panelId: string, followedCount: number): boolean {
  const active = readActive(panelId);
  if (!active) return false;
  if (followedCount > 0) return true;
  writeActive(panelId, false);
  return false;
}

interface ViewState {
  visible: boolean;
  active: boolean;
  disabled: boolean;
  label: string;
}

function computeViewState(props: FollowedOnlyChipProps): ViewState {
  if (!isFollowFeatureEnabled()) {
    return { visible: false, active: false, disabled: false, label: props.label ?? 'Followed only' };
  }
  const followedCount = getFollowed().length;
  const disabled = followedCount === 0;
  const active = readEffectiveActive(props.panelId, followedCount);
  return { visible: true, active, disabled, label: props.label ?? 'Followed only' };
}

function renderHtml(state: ViewState): string {
  if (!state.visible) return '';
  const safeLabel = escapeHtml(state.label);
  const tooltip = state.disabled
    ? 'Follow countries to enable this filter'
    : state.active
      ? 'Showing only your followed countries — click to clear'
      : 'Show only your followed countries';
  const safeTooltip = escapeHtml(tooltip);
  const cls = ['wm-followed-only-chip', state.active ? 'wm-followed-only-chip--active' : '', state.disabled ? 'wm-followed-only-chip--disabled' : ''].filter(Boolean).join(' ');
  const ariaPressed = state.active ? 'true' : 'false';
  return (
    `<button type="button" class="${cls}"` +
    ` aria-pressed="${ariaPressed}"` +
    ` aria-label="${safeTooltip}"` +
    ` title="${safeTooltip}"` +
    (state.disabled ? ' disabled' : '') +
    ` data-state="${state.active ? 'active' : 'inactive'}"` +
    `>` +
    `<svg class="wm-followed-only-chip-icon" width="12" height="12" viewBox="0 0 24 24"` +
    ` fill="${state.active ? 'currentColor' : 'none'}"` +
    ` stroke="currentColor" stroke-width="2"` +
    ` stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>` +
    `</svg>` +
    `<span class="wm-followed-only-chip-label">${safeLabel}</span>` +
    `</button>`
  );
}

export function renderFollowedOnlyChip(props: FollowedOnlyChipProps): FollowedOnlyChipHandle {
  const flagOn = isFollowFeatureEnabled();

  if (!flagOn) {
    return {
      html: '',
      attach: (_host: HTMLElement) => () => { /* no-op */ },
      isActive: () => false,
    };
  }

  const initialState = computeViewState(props);
  const initialHtml = renderHtml(initialState);

  return {
    html: initialHtml,
    attach(host: HTMLElement): () => void {
      let tornDown = false;

      const rerender = (): void => {
        if (tornDown) return;
        const next = computeViewState(props);
        setTrustedHtml(host, trustedHtml(renderHtml(next), 'legacy direct innerHTML migration'));
      };

      rerender();

      const clickHandler = (ev: Event): void => {
        if (tornDown) return;
        const target = ev.target as Element | null;
        const btn = target && typeof (target as Element).closest === 'function'
          ? (target as Element).closest<HTMLElement>('.wm-followed-only-chip')
          : null;
        if (!btn) return;
        if (btn.hasAttribute('disabled')) return;
        ev.preventDefault();
        const before = readActive(props.panelId);
        const next = !before;
        writeActive(props.panelId, next);
        rerender();
        try {
          props.onChange?.(next);
        } catch (err) {
          console.warn('[followed-only-chip] onChange threw:', err);
        }
      };

      host.addEventListener('click', clickHandler);

      const unsubWatchlist = subscribe(rerender);

      return () => {
        if (tornDown) return;
        tornDown = true;
        try { host.removeEventListener('click', clickHandler); } catch { /* swallow */ }
        try { unsubWatchlist(); } catch { /* swallow */ }
      };
    },
    isActive: () => {
      if (!isFollowFeatureEnabled()) return false;
      return readEffectiveActive(props.panelId, getFollowed().length);
    },
  };
}

export function _resetAllPersistedStateForTests(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keysToRemove: string[] = [];
    const len = (localStorage as unknown as { length?: number }).length;
    if (typeof len === 'number' && typeof (localStorage as unknown as { key?: (i: number) => string | null }).key === 'function') {
      const keyFn = (localStorage as unknown as { key: (i: number) => string | null }).key;
      for (let i = 0; i < len; i += 1) {
        const k = keyFn.call(localStorage, i);
        if (k && k.startsWith(STORAGE_KEY_PREFIX)) keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    /* swallow */
  }
}
