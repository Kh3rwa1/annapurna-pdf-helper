import bn from '../locales/bn.json';
import en from '../locales/en.json';

type LocaleKey = keyof typeof en;
type Locale = 'bn' | 'en';

const dictionaries: Record<Locale, Record<string, string>> = { bn, en };

export function t(key: LocaleKey, replacements: Record<string, string | number> = {}, locale: Locale = 'bn'): string {
  const template = dictionaries[locale][key] || dictionaries.en[key] || key;
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

export type { LocaleKey, Locale };
