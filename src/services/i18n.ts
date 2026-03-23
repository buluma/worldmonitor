import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English is always needed as fallback — bundle it eagerly.
import enTranslation from '../locales/en.json';

const SUPPORTED_LANGUAGES = ['en', 'bg', 'cs', 'fr', 'de', 'el', 'es', 'it', 'pl', 'pt', 'nl', 'sv', 'ru', 'ar', 'zh', 'ja', 'ko', 'ro', 'tr', 'th', 'vi'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
type TranslationDictionary = Record<string, unknown>;

const SUPPORTED_LANGUAGE_SET = new Set<SupportedLanguage>(SUPPORTED_LANGUAGES);
const loadedLanguages = new Set<SupportedLanguage>();

// Lazy-load only the locale that's actually needed — all others stay out of the bundle.
const localeModules = import.meta.glob<TranslationDictionary>(
  ['../locales/*.json', '!../locales/en.json'],
  { import: 'default' },
);

const RTL_LANGUAGES = new Set(['ar']);

function normalizeLanguage(lng: string): SupportedLanguage {
  if (!lng) return 'en';
  const base = lng.split('-')[0]?.toLowerCase() || 'en';
  if (base === 'en') return 'en';
  if (SUPPORTED_LANGUAGE_SET.has(base as SupportedLanguage)) {
    return base as SupportedLanguage;
  }
  return 'en';
}

function applyDocumentDirection(lang: string): void {
  const base = lang.split('-')[0] || lang;
  document.documentElement.setAttribute('lang', base === 'zh' ? 'zh-CN' : base);
  if (RTL_LANGUAGES.has(base)) {
    document.documentElement.setAttribute('dir', 'rtl');
  } else {
    document.documentElement.removeAttribute('dir');
  }
}

async function ensureLanguageLoaded(lng: string): Promise<SupportedLanguage> {
  const normalized = normalizeLanguage(lng);

  // If we already have this specific language code loaded, return.
  if (loadedLanguages.has(lng as any) && i18next.hasResourceBundle(lng, 'translation')) {
    return normalized;
  }

  // If we have the normalized version but not the explicit one requested,
  // we can just re-register it to be safe, or rely on fallback.
  // For 'en-*' locales, we definitely want them points to 'enTranslation'.
  if (normalized === 'en' && !loadedLanguages.has('en' as any)) {
    i18next.addResourceBundle('en', 'translation', enTranslation as TranslationDictionary, true, true);
    loadedLanguages.add('en');
  }

  if (loadedLanguages.has(normalized) && normalized !== 'en') {
    // Already in resource registry
  } else if (normalized !== 'en') {
    const loader = localeModules[`../locales/${normalized}.json`];
    if (loader) {
      const translation = await loader();
      i18next.addResourceBundle(normalized, 'translation', translation, true, true);
      loadedLanguages.add(normalized);
    }
  }

  // Explicitly add to the requested 'en-*' if it's English
  if (lng.startsWith('en') && lng !== 'en' && !i18next.hasResourceBundle(lng, 'translation')) {
    i18next.addResourceBundle(lng, 'translation', enTranslation as TranslationDictionary, true, true);
    loadedLanguages.add(lng as any);
  }

  return normalized;
}

// Initialize i18n
export async function initI18n(): Promise<void> {
  if (i18next.isInitialized) {
    const currentLanguage = normalizeLanguage(i18next.language || 'en');
    await ensureLanguageLoaded(currentLanguage);
    applyDocumentDirection(i18next.language || currentLanguage);
    return;
  }

  loadedLanguages.add('en');

  await i18next
    .use(LanguageDetector)
    .init({
      resources: {
        en: { translation: enTranslation as TranslationDictionary },
      },
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      load: 'languageOnly',
      fallbackLng: 'en',
      debug: import.meta.env.DEV,
      interpolation: {
        escapeValue: false, // not needed for these simple strings
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
      },
    });

  const detectedLanguage = await ensureLanguageLoaded(i18next.language || 'en');
  if (detectedLanguage !== 'en') {
    // Re-trigger translation resolution now that the detected bundle is loaded.
    await i18next.changeLanguage(detectedLanguage);
  }

  applyDocumentDirection(i18next.language || detectedLanguage);
}

// Helper to translate
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}

// Helper to change language
export async function changeLanguage(lng: string): Promise<void> {
  const normalized = await ensureLanguageLoaded(lng);
  await i18next.changeLanguage(normalized);
  applyDocumentDirection(normalized);
  window.location.reload(); // Simple reload to update all components for now
}

// Helper to get current language (normalized to short code)
export function getCurrentLanguage(): string {
  const lang = i18next.language || 'en';
  return lang.split('-')[0]!;
}

export function isRTL(): boolean {
  return RTL_LANGUAGES.has(getCurrentLanguage());
}

export function getLocale(): string {
  const lang = getCurrentLanguage();
  const map: Record<string, string> = { en: 'en-US', bg: 'bg-BG', cs: 'cs-CZ', el: 'el-GR', zh: 'zh-CN', pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR', ro: 'ro-RO', tr: 'tr-TR', th: 'th-TH', vi: 'vi-VN' };
  return map[lang] || lang;
}

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'bg', label: 'Български', flag: '🇧🇬' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'el', label: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ro', label: 'Română', flag: '🇷🇴' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
];
