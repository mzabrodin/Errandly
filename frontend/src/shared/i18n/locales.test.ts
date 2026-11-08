import en from './locales/en.json';
import uk from './locales/uk.json';

// Plural forms differ between languages (uk: one/few/many/other, en: one/other)
const PLURAL_SUFFIX = /_(one|few|many|other)$/;

function keysOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, `${prefix}${key}.`));
}

function translationKeys(locale: unknown): string[] {
  const keys = keysOf(locale).map((key) => key.slice(0, -1).replace(PLURAL_SUFFIX, ''));
  return [...new Set(keys)].toSorted();
}

describe('locales', () => {
  it('have the same keys in Ukrainian and English', () => {
    expect(translationKeys(en)).toEqual(translationKeys(uk));
  });

  it('have the same number of tips and marquee lines', () => {
    expect(en.aside.tips).toHaveLength(uk.aside.tips.length);
    expect(en.landing.marquee).toHaveLength(uk.landing.marquee.length);
  });
});
