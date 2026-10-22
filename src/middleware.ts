import { NextRequest, NextResponse } from 'next/server';
import {
  COUNTRY_TO_LOCALE,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  normalizeLocale,
} from './i18n/config';
import { SITES, SITE_COOKIE, isSite, type Site } from './lib/sites';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site';
const ONE_YEAR = 60 * 60 * 24 * 365;

function resolveSite(req: NextRequest): { site: Site; persist: boolean; prod: boolean } {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  const prod = host === ROOT || host.endsWith(`.${ROOT}`);

  if (prod) {
    const sub = host === ROOT ? 'www' : host.slice(0, -(ROOT.length + 1));
    return { site: isSite(sub) ? sub : 'www', persist: false, prod };
  }

  // Local development: ?site=trade simulates a subdomain and is remembered in a cookie.
  const q = req.nextUrl.searchParams.get('site');
  if (isSite(q)) return { site: q, persist: true, prod };
  const c = req.cookies.get(SITE_COOKIE)?.value;
  if (isSite(c)) return { site: c, persist: false, prod };
  return { site: 'www', persist: false, prod };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The internal /sites/* tree is an implementation detail and never directly routable.
  if (pathname === '/sites' || pathname.startsWith('/sites/')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { site, persist, prod } = resolveSite(req);

  // ── Locale priority: 1) explicit choice (cookie) 2) device/browser language
  //    (Accept-Language) 3) IP country (cf-ipcountry) 4) English (US) ─────────────
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  let locale = normalizeLocale(cookieLocale) ?? '';
  // Re-write legacy values such as "en" to the canonical code
  let setLocaleCookie = !!cookieLocale && locale !== '' && cookieLocale !== locale;
  if (!locale) {
    const fromDevice = localeFromAcceptLanguage(req.headers.get('accept-language'));
    const country = (req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || '').toUpperCase();
    locale = fromDevice || COUNTRY_TO_LOCALE[country] || DEFAULT_LOCALE;
    setLocaleCookie = true;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-sg-locale', locale);
  requestHeaders.set('x-sg-site', site);

  const url = req.nextUrl.clone();
  url.pathname = `/sites/${site}${pathname === '/' ? '' : pathname}`;
  const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });

  const cookieDomain = prod ? `.${ROOT}` : undefined;

  if (setLocaleCookie) {
    res.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: ONE_YEAR,
      sameSite: 'lax',
      domain: cookieDomain,
    });
  }
  if (persist) {
    res.cookies.set(SITE_COOKIE, site, { path: '/', sameSite: 'lax' });
  }
  if (site !== 'www') {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  res.headers.set('Vary', 'Cookie, Host');
  return res;
}

export const config = {
  matcher: [
    // Skip API, Next internals, and anything that looks like a static file.
    '/((?!api/|_next/|icons/|favicon.ico|sw.js|manifest.json|manifest.webmanifest|offline.html|.*\\..*).*)',
  ],
};

export { SITES };
