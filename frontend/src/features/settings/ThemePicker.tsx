import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { setPrefs, THEMES, usePrefs, type Theme } from '../../shared/lib/prefs';
import styles from './ThemePicker.module.css';

/** Міні-превʼю теми: небо, хмарка, пагорби й плашка акценту в її кольорах */
function Preview({ theme }: { theme: Theme }): JSX.Element {
  return (
    <span className={styles.preview} data-theme-preview={theme} aria-hidden>
      <span className={styles.sky} />
      <span className={styles.cloud} />
      <span className={styles.hillBack} />
      <span className={styles.hillFront} />
      <span className={styles.pill} />
    </span>
  );
}

export function ThemePicker(): JSX.Element {
  const { t } = useTranslation();
  const { theme } = usePrefs();

  return (
    <div className={styles.grid} role="radiogroup" aria-label={t('settings.theme')}>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- картка-кнопка з превʼю, а не нативний radio
          role="radio"
          aria-checked={theme === option}
          className={clsx(styles.option, theme === option && styles.selected)}
          onClick={() => setPrefs({ theme: option })}
        >
          <Preview theme={option} />
          <span className={styles.label}>
            {theme === option && <Check size={15} strokeWidth={3} />}
            {t(`settings.themes.${option}`)}
          </span>
        </button>
      ))}
    </div>
  );
}
