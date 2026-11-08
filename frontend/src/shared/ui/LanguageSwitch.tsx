import { clsx } from 'clsx';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { changeLocale, currentLocale, type Locale } from '../i18n';
import styles from './LanguageSwitch.module.css';

const NEXT: Record<Locale, { locale: Locale; label: string; name: string }> = {
  uk: { locale: 'en', label: 'EN', name: 'English' },
  en: { locale: 'uk', label: 'UA', name: 'Українська' },
};

/** Toggles the UI language on signed-out pages; signed-in users pick it in the settings */
export function LanguageSwitch({ className }: { className?: string }): JSX.Element {
  // Subscribes to language changes so the label updates
  useTranslation();
  const next = NEXT[currentLocale()];

  return (
    <button
      type="button"
      className={clsx(styles.switch, className)}
      lang={next.locale}
      aria-label={next.name}
      onClick={() => void changeLocale(next.locale)}
    >
      {next.label}
    </button>
  );
}
