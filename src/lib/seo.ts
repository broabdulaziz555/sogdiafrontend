import { DEFAULT_LOCALE, LOCALE_CODES } from '@/i18n/config';

/** Public marketing origin (the only indexable site; app / trade / xdepartment are noindex). */
export const SITE_URL = `https://www.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site'}`;

export const BRAND = 'SOGDIA';
export const LEGAL_NAME = 'SOGDIA CAPITAL INC.';

/** Official social accounts — one place to change them. */
export const SOCIAL = {
  handle: '@sogdiacapital',
  instagram: 'https://www.instagram.com/sogdiacapital/',
  x: 'https://x.com/sogdiacapital',
} as const;

/** Marketing pages listed in the sitemap, most important first. */
export const INDEXABLE_PATHS = ['/', '/register', '/legal/execution'] as const;

/** BCP-47 tag for hreflang. */
export function hreflang(code: string): string {
  if (code === 'en-US') return 'en';
  if (code === 'zh') return 'zh-Hans';
  return code;
}

const OG_LOCALE: Record<string, string> = {
  'en-US': 'en_US', 'en-GB': 'en_GB', ru: 'ru_RU', uk: 'uk_UA', uz: 'uz_UZ', kk: 'kk_KZ', ky: 'ky_KG', tg: 'tg_TJ', az: 'az_AZ',
  tr: 'tr_TR', ka: 'ka_GE', hy: 'hy_AM', pl: 'pl_PL', ro: 'ro_RO', es: 'es_ES', pt: 'pt_BR', fr: 'fr_FR', de: 'de_DE', nl: 'nl_NL',
  it: 'it_IT', ar: 'ar_AR', fa: 'fa_IR', hi: 'hi_IN', bn: 'bn_BD', id: 'id_ID', vi: 'vi_VN', th: 'th_TH', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR',
};
export const ogLocale = (code: string) => OG_LOCALE[code] ?? 'en_US';

/** Absolute URL of `path` in a language: English is the bare URL, every other language adds ?lang=. */
export function localizedUrl(path: string, code: string): string {
  const clean = path === '' ? '/' : path;
  return code === DEFAULT_LOCALE ? `${SITE_URL}${clean}` : `${SITE_URL}${clean}?lang=${encodeURIComponent(code)}`;
}

/** hreflang map for one path: every language plus x-default (English). */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of LOCALE_CODES) out[hreflang(code)] = localizedUrl(path, code);
  out['x-default'] = localizedUrl(path, DEFAULT_LOCALE);
  return out;
}

/** schema.org Organization + WebSite, linked to the official social profiles. */
export function organizationJsonLd(description: string, inLanguage: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: BRAND,
        legalName: LEGAL_NAME,
        alternateName: ['SOGDIA Capital', 'sogdia.site'],
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        description,
        sameAs: [SOCIAL.instagram, SOCIAL.x],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'SOGDIA.SITE',
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage,
      },
    ],
  };
}
