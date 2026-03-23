const buildVariant = (() => {
  try {
    return import.meta.env?.VITE_VARIANT || 'full';
  } catch {
    return 'full';
  }
})();

export const SITE_VARIANT: string = (() => {
  if (typeof window === 'undefined') return buildVariant;

  const readStoredVariant = (): string | null => {
    const stored = localStorage.getItem('worldmonitor-variant');
    return stored === 'tech' || stored === 'full' || stored === 'finance' || stored === 'happy' || stored === 'commodity'
      ? stored
      : null;
  };

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) {
    const stored = readStoredVariant();
    if (stored) return stored;
    return buildVariant;
  }

  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';

  const isRuntimeSwitchHost = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app');
  if (isRuntimeSwitchHost) {
    const stored = readStoredVariant();
    if (stored) return stored;
    return buildVariant;
  }

  return 'full';
})();
