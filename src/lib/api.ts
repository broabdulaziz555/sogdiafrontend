import { clearSession, getAccessToken, getRefreshToken, isExpiringSoon, setSession } from './auth';
import type { Session } from './types';

/**
 * Resolves the API root. Accepts NEXT_PUBLIC_API_URL with or without the `/api` suffix
 * (`https://host`, `https://host/`, `https://host/api`, or the same-origin default `/api`)
 * and always returns a base that ends in `/api`.
 */
function resolveApiBase(raw: string | undefined): string {
  let base = (raw ?? '').trim().replace(/\/+$/, '');
  if (!base) base = '/api';
  if (!/\/api$/i.test(base)) base += '/api';
  return base;
}

export const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_URL);

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  form?: FormData;
  /** Send the bearer token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Abort and fail with code TIMEOUT after this many ms (no timeout by default). */
  timeoutMs?: number;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
  }
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ''}`;
}

/** Absolute URL for an asset path such as `/api/og/certificate/<id>` returned by the API. */
export function assetUrl(p: string): string {
  if (/^https?:\/\//.test(p)) return p;
  if (API_BASE.startsWith('http')) {
    const origin = new URL(API_BASE).origin;
    return p.startsWith('/api') ? `${origin}${p}` : `${origin}${p.startsWith('/') ? '' : '/'}${p}`;
  }
  return p;
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    const json = await res.json();
    if (json?.ok && json.data?.session) {
      setSession(json.data.session as Session);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  return false;
}

function refreshOnce(): Promise<boolean> {
  if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

async function send<T>(path: string, opts: RequestOpts, retried: boolean): Promise<T> {
  const { method = 'GET', query, body, form, auth = true, signal: outerSignal, headers = {}, timeoutMs } = opts;
  const ctl = timeoutMs ? new AbortController() : null;
  let timedOut = false;
  const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs) : undefined;
  if (ctl && outerSignal) outerSignal.addEventListener('abort', () => ctl.abort(), { once: true });
  const signal = ctl?.signal ?? outerSignal;
  const timeoutErr = () => new ApiError('TIMEOUT', 'The server took too long to answer. The order may still have gone through — check Positions before trying again.', 0);
  try {

    if (auth && !retried && isExpiringSoon() && getRefreshToken()) await refreshOnce();

    const h: Record<string, string> = { Accept: 'application/json', ...headers };
    const token = auth ? getAccessToken() : null;
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined && !form) h['Content-Type'] = 'application/json';

    const doFetch = (hdrs: Record<string, string>) =>
      fetch(buildUrl(path, query), {
        method,
        headers: hdrs,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
        signal,
        cache: 'no-store',
      });

    let res: Response;
    try {
      res = await doFetch(h);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw timedOut ? timeoutErr() : e;
      // A browser reports a CORS-blocked preflight as a plain network failure. If the backend's CORS allow-list lacks
      // the optional `Idempotency-Key` header, the request never leaves the browser — so retry once without it.
      if (h['Idempotency-Key']) {
        const { ['Idempotency-Key']: _dropped, ...rest } = h;
        void _dropped;
        console.warn('[api] request failed with Idempotency-Key; retrying without it. Add "Idempotency-Key" to the backend CORS allowed headers.');
        try {
          res = await doFetch(rest);
        } catch (e2) {
          if ((e2 as Error)?.name === 'AbortError') throw timedOut ? timeoutErr() : e2;
          throw new ApiError('NETWORK_ERROR', 'Network unreachable. Check your connection.', 0);
        }
      } else {
        throw new ApiError('NETWORK_ERROR', 'Network unreachable. Check your connection.', 0);
      }
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }

    if (res.status === 401 && auth && !retried && getRefreshToken()) {
      if (await refreshOnce()) return send<T>(path, opts, true);
      clearSession();
    }

    if (json && json.ok === true) return json.data as T;

    const err = json?.error;
    if (res.status === 401 && auth) clearSession();
    throw new ApiError(
      err?.code || (res.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR'),
      err?.message || `Request failed (${res.status})`,
      res.status,
      err?.details ?? null,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  return send<T>(path, opts, false);
}

// Reads fail after 45 s instead of hanging forever (the terminal passes its own, shorter deadline for its poll).
export const get = <T>(path: string, query?: Query, opts: RequestOpts = {}) => api<T>(path, { timeoutMs: 45_000, ...opts, query });
export const post = <T>(path: string, body?: unknown, opts: RequestOpts = {}) => api<T>(path, { ...opts, method: 'POST', body });
export const put = <T>(path: string, body?: unknown, opts: RequestOpts = {}) => api<T>(path, { ...opts, method: 'PUT', body });
export const patch = <T>(path: string, body?: unknown, opts: RequestOpts = {}) => api<T>(path, { ...opts, method: 'PATCH', body });
export const del = <T>(path: string, opts: RequestOpts = {}) => api<T>(path, { ...opts, method: 'DELETE' });

/** multipart upload with progress (fetch cannot report upload progress). */
export function upload<T>(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError('NETWORK_ERROR', 'Upload failed. Check your connection.', 0));
    xhr.onload = () => {
      let json: any = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (json?.ok) return resolve(json.data as T);
      reject(new ApiError(json?.error?.code || 'INTERNAL_ERROR', json?.error?.message || 'Upload failed', xhr.status, json?.error?.details));
    };
    xhr.send(form);
  });
}

/** Human-readable message for an unknown thrown value. */
export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return ERROR_COPY[e.code] ?? e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

const ERROR_COPY: Record<string, string> = {
  NETWORK_ERROR: 'Network unreachable. Check your connection and retry.',
  TIMEOUT: 'The server took too long to answer. The order may still have gone through — check Positions before trying again.',
  SYMBOL_NOT_ALLOWED: 'This pair is not available for trading.',
  INSUFFICIENT_MARGIN: 'Not enough free margin for this order. Lower the margin or the leverage.',
  ACCOUNT_NOT_TRADABLE: 'This account cannot open new positions right now.',
  RATE_LIMITED: 'Too many requests — slow down and retry in a moment.',
  UPSTREAM_ERROR: 'Market data provider is unreachable. Retry shortly.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'Your account is not allowed to do this. If your role was just changed, sign out and sign back in to refresh your session.',
};
