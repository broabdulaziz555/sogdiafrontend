export interface LocaleMeta {
  code: string;
  name: string; // native name
  dir: 'ltr' | 'rtl';
}

/**
 * The 30 supported UI languages. Every one ships a full messages/<code>.json.
 * en-US is the source of truth (messages/en.json); any key missing from another
 * file falls back to it at request time.
 */
export const LOCALES: LocaleMeta[] = [
  { code: 'en-US', name: 'English (US)', dir: 'ltr' },
  { code: 'en-GB', name: 'English (UK)', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'uz', name: 'Oʻzbekcha', dir: 'ltr' },
  { code: 'kk', name: 'Қазақша', dir: 'ltr' },
  { code: 'ky', name: 'Кыргызча', dir: 'ltr' },
  { code: 'tg', name: 'Тоҷикӣ', dir: 'ltr' },
  { code: 'az', name: 'Azərbaycanca', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr' },
  { code: 'ka', name: 'ქართული', dir: 'ltr' },
  { code: 'hy', name: 'Հայերեն', dir: 'ltr' },
  { code: 'uk', name: 'Українська', dir: 'ltr' },
  { code: 'pl', name: 'Polski', dir: 'ltr' },
  { code: 'ro', name: 'Română', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'nl', name: 'Nederlands', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'fa', name: 'فارسی', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { code: 'bn', name: 'বাংলা', dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt', dir: 'ltr' },
  { code: 'th', name: 'ไทย', dir: 'ltr' },
  { code: 'zh', name: '简体中文', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
];

export const DEFAULT_LOCALE = 'en-US';
export const LOCALE_COOKIE = 'sg_locale';
export const LOCALE_CODES = LOCALES.map((l) => l.code);

/** Maps legacy / loose codes (e.g. "en", "pt-BR") onto a supported locale, or null. */
export function normalizeLocale(v: string | undefined | null): string | null {
  if (!v) return null;
  if (LOCALE_CODES.includes(v)) return v;
  const lower = v.toLowerCase();
  if (lower === 'en') return 'en-US';
  if (lower === 'en-us') return 'en-US';
  if (lower === 'en-gb') return 'en-GB';
  const base = lower.split('-')[0];
  if (base === 'en') return 'en-US';
  return LOCALE_CODES.includes(base) ? base : null;
}

export function isLocale(v: string | undefined | null): v is string {
  return normalizeLocale(v) !== null;
}

export function localeDir(code: string): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.code === code)?.dir ?? 'ltr';
}

/** ISO-3166 alpha-2 country → UI language. Anything unmapped falls back to English (US). */
export const COUNTRY_TO_LOCALE: Record<string, string> = {
  // English
  US: 'en-US', CA: 'en-US', PH: 'en-US', LR: 'en-US',
  GB: 'en-GB', IE: 'en-GB', AU: 'en-GB', NZ: 'en-GB', SG: 'en-GB', IN_EN: 'en-GB', ZA: 'en-GB', NG: 'en-GB', GH: 'en-GB', KE: 'en-GB', MT: 'en-GB',
  // Russian & Central Asia / Caucasus
  RU: 'ru', BY: 'ru',
  UZ: 'uz', KZ: 'kk', KG: 'ky', TJ: 'tg', AZ: 'az', GE: 'ka', AM: 'hy', TM: 'ru',
  TR: 'tr', CY: 'tr',
  // Europe
  UA: 'uk', PL: 'pl', RO: 'ro', MD: 'ro',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', CM: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', UY: 'es', BO: 'es', PY: 'es', CR: 'es', PA: 'es', DO: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es', CU: 'es',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
  IT: 'it', SM: 'it', NL: 'nl', SR: 'nl',
  // MENA
  SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', QA: 'ar', BH: 'ar', OM: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LB: 'ar', LY: 'ar', SY: 'ar', YE: 'ar', SD: 'ar', PS: 'ar',
  IR: 'fa', AF: 'fa',
  // Asia
  IN: 'hi', BD: 'bn', ID: 'id', VN: 'vi', TH: 'th', CN: 'zh', TW: 'zh', HK: 'zh', JP: 'ja', KR: 'ko',
};

export function localeForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_LOCALE;
  return COUNTRY_TO_LOCALE[country.toUpperCase()] ?? DEFAULT_LOCALE;
}

const EN_GB_REGIONS = new Set(['gb', 'ie', 'au', 'nz', 'za', 'in', 'sg', 'ng', 'ke', 'gh', 'mt', 'hk', 'pk']);

/**
 * Picks the best supported UI language from an Accept-Language header (the device / browser
 * system language). Entries are honoured in order of q-weight, so a device set to English first
 * gets English even when the visitor's IP is in, say, Uzbekistan. Returns null if nothing matches.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const entries = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? parseFloat(qParam.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of entries) {
    const [base, ...rest] = tag.split('-');
    if (base === 'en') {
      const region = rest.find((r) => r.length === 2);
      return region && EN_GB_REGIONS.has(region) ? 'en-GB' : 'en-US';
    }
    // zh-Hans / zh-CN / zh-TW / zh-HK all map to the single Chinese UI
    const hit = normalizeLocale(tag) ?? normalizeLocale(base);
    if (hit) return hit;
  }
  return null;
}
