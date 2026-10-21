import type { Session } from './types';
import { ROOT_DOMAIN } from './sites';

/**
 * Session storage. Three cookies scoped to .<root-domain> in production so that a
 * login on www. is shared with app./trade./xdepartment.; host-only cookies on localhost.
 * (The tokens are readable by JS by design — the Supabase JWT is sent as a Bearer header.)
 */
const AT = 'sg_at';
const RT = 'sg_rt';
const EXP = 'sg_exp';

export const AUTH_EVENT = 'sg:auth';

function domainAttr(): string {
  if (typeof location === 'undefined') return '';
  const h = location.hostname;
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`) ? `; Domain=.${ROOT_DOMAIN}; Secure` : '';
}

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${domainAttr()}`;
}

/** Expire the host-only variant of a cookie (leaves the `.root-domain` one alone). */
function expireHostOnly(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  purgeHostOnlyDuplicates();
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * In production the session lives in `.root-domain` cookies. An older host-only cookie with the same name
 * (e.g. from a previous login on this exact host) shadows it and makes the client send a stale / wrong user's
 * token. When both exist we drop the host-only copy so everything reads the shared one.
 */
let purged = false;
function purgeHostOnlyDuplicates() {
  if (purged || typeof document === 'undefined' || !domainAttr()) return;
  purged = true;
  const dupes = (document.cookie.match(/(?:^|; )sg_at=/g) || []).length;
  if (dupes > 1) for (const n of [AT, RT, EXP]) expireHostOnly(n);
}

export function getSession(): Session | null {
  const at = getCookie(AT);
  const rt = getCookie(RT);
  if (!at || !rt) return null;
  return { access_token: at, refresh_token: rt, expires_at: Number(getCookie(EXP) || 0) };
}

export function getAccessToken(): string | null {
  return getCookie(AT);
}

export function setSession(s: Session) {
  if (domainAttr()) for (const n of [AT, RT, EXP]) expireHostOnly(n);
  setCookie(AT, s.access_token, 60 * 60 * 24 * 30);
  setCookie(RT, s.refresh_token, 60 * 60 * 24 * 30);
  setCookie(EXP, String(s.expires_at), 60 * 60 * 24 * 30);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearSession() {
  for (const n of [AT, RT, EXP]) { setCookie(n, '', 0); expireHostOnly(n); }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EVENT));
    // Drop any cached API responses held by the service worker (balances, profile…).
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
  }
}

/** True when the access token expires within `skew` seconds. */
export function isExpiringSoon(skew = 45): boolean {
  const exp = Number(getCookie(EXP) || 0);
  return !!exp && exp - Math.floor(Date.now() / 1000) < skew;
}

export function getRefreshToken(): string | null {
  return getCookie(RT);
}
