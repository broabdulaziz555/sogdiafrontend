import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from './config';

type Dict = { [k: string]: string | Dict };

function deepMerge(base: Dict, over: Dict): Dict {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === 'object' && b && typeof b === 'object'
        ? deepMerge(b as Dict, v as Dict)
        : (v as string);
  }
  return out;
}

export default getRequestConfig(async () => {
  // The middleware already resolved ?lang → cookie → device → country; its answer wins (a ?lang URL must not be
  // overridden by an older cookie on the same request).
  const locale =
    normalizeLocale(headers().get('x-sg-locale')) ??
    normalizeLocale(cookies().get(LOCALE_COOKIE)?.value) ??
    DEFAULT_LOCALE;

  // messages/en.json is the en-US source of truth; every other file is merged over it,
  // so a missing key always degrades to English instead of rendering a raw key.
  const en = (await import('../../messages/en.json')).default as unknown as Dict;
  let messages = en;
  if (locale !== 'en-US') {
    try {
      const local = (await import(`../../messages/${locale}.json`)).default as Dict;
      messages = deepMerge(en, local);
    } catch {
      /* no file for this locale — English fallback */
    }
  }
  return { locale, messages, timeZone: 'UTC' };
});
