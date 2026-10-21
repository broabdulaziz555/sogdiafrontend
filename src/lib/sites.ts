export type Site = 'www' | 'app' | 'trade' | 'xdepartment';

export const SITES: Site[] = ['www', 'app', 'trade', 'xdepartment'];
export const SITE_COOKIE = 'sg_site';
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site';

export function isSite(v: string | null | undefined): v is Site {
  return !!v && (SITES as string[]).includes(v);
}

/** Production URL for a site. */
export function prodHref(site: Site, path = '/'): string {
  return `https://${site}.${ROOT_DOMAIN}${path}`;
}

/**
 * Client-side URL builder. On a real *.sogdia.site host it returns an absolute
 * cross-subdomain URL; on localhost it returns a same-origin path carrying
 * ?site=<site> so the middleware can switch sites.
 */
export function siteHref(site: Site, path = '/'): string {
  if (typeof window === 'undefined') return prodHref(site, path);
  const host = window.location.hostname;
  if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) {
    return `${window.location.protocol}//${site}.${ROOT_DOMAIN}${path}`;
  }
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}site=${site}`;
}

export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return !(host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`));
}
