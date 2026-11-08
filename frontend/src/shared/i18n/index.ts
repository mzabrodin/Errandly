import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import uk from './locales/uk.json';

export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

// Ukrainian is the default (NFR-USE-03); the signed-in user's account locale overrides it
const DEFAULT_LOCALE: Locale = 'uk';
const STORAGE_KEY = 'errandly-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((locale) => locale === value);
}

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function currentLocale(): Locale {
  return isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}

/** Switches the UI language and remembers it in this browser */
export async function changeLocale(locale: Locale): Promise<void> {
  if (locale === currentLocale()) return;
  await i18n.changeLanguage(locale);
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not critical: the default language is used next time
  }
});

void i18n.use(initReactI18next).init({
  resources: { uk: { translation: uk }, en: { translation: en } },
  lng: storedLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LOCALES,
  interpolation: { escapeValue: false },
});
document.documentElement.lang = currentLocale();

export default i18n;
