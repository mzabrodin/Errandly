import i18next, { type ParseKeys, type TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { Trans } from 'react-i18next';

import { DEFAULT_LOCALE, LOCALES, type Locale } from '../common/domain.js';
import en from './locales/en.json' with { type: 'json' };
import uk from './locales/uk.json' with { type: 'json' };

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof uk };
  }
}

const i18n = i18next.createInstance();
// Resources are inline and initAsync is off, so the instance is ready when init returns
void i18n.init({
  resources: { uk: { translation: uk }, en: { translation: en } },
  supportedLngs: LOCALES,
  fallbackLng: DEFAULT_LOCALE,
  initAsync: false,
  interpolation: { escapeValue: false },
});

export type MailT = TFunction;
export type MailKey = ParseKeys;

export const INTL_LOCALES: Record<Locale, string> = { uk: 'uk-UA', en: 'en-GB' };

export function mailT(locale: Locale): MailT {
  return i18n.getFixedT(locale);
}

const NO_VALUES = {};
const BOLD = { b: <strong style={{ fontWeight: 800 }} /> };

interface RichProps {
  t: MailT;
  i18nKey: MailKey;
  values?: Record<string, string | number>;
}

/**
 * A translation with <b> markup. Values are escaped before Trans parses the markup and
 * unescaped after, so a group named "<b>x</b>" stays text.
 */
export function Rich({ t, i18nKey, values }: RichProps): ReactElement {
  return (
    <Trans
      i18n={i18n}
      t={t}
      i18nKey={i18nKey}
      values={values ?? NO_VALUES}
      components={BOLD}
      tOptions={{ interpolation: { escapeValue: true } }}
      shouldUnescape
    />
  );
}
