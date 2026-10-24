// Run: npx tsx tests/api-refresh.test.ts   (jsdom cookies + a scriptable fetch; the real api client)
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window; g.document = dom.window.document; g.Event = dom.window.Event;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
setInterval(() => {}, 1000);

type Mode = 'ok' | 'hang' | 'down' | 'denied';
let refreshMode: Mode = 'ok';
let pingStatus: (auth: string | null) => number = () => 200;
const seen: { path: string; auth: string | null }[] = [];

g.fetch = async (input: any, init: any = {}) => {
  const path = String(input);
  const auth = new Headers(init.headers).get('authorization');
  seen.push({ path, auth });
  const j = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (path.endsWith('/auth/refresh')) {
    if (refreshMode === 'hang') await new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (refreshMode === 'down') return j({ ok: false, error: { code: 'UPSTREAM_ERROR', message: 'slow' } }, 502);
    if (refreshMode === 'denied') return j({ ok: false, error: { code: 'UNAUTHORIZED', message: 'bad' } }, 401);
    return j({ ok: true, data: { session: { access_token: 'new-at', refresh_token: 'new-rt', expires_at: Math.floor(Date.now() / 1000) + 3600 } } });
  }
  const st = pingStatus(auth);
  return st === 200 ? j({ ok: true, data: { pong: true, auth } }) : j({ ok: false, error: { code: 'UNAUTHORIZED', message: 'expired' } }, st);
};

(async () => {
  const { get } = await import('../src/lib/api');
  const { setSession, getSession } = await import('../src/lib/auth');
  const login = (expiresInSec: number) => setSession({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: Math.floor(Date.now() / 1000) + expiresInSec } as any);
  const t = async <T,>(f: () => Promise<T>) => { const t0 = Date.now(); try { return { v: await f(), ms: Date.now() - t0, e: null as any }; } catch (e) { return { v: null as any, ms: Date.now() - t0, e }; } };

  // 1 token about to expire and the refresh never answers: the request still goes out, after ~3 s, with the current token
  login(20); refreshMode = 'hang'; seen.length = 0; pingStatus = () => 200;
  let r = await t(() => get<any>('/ping'));
  assert.ok(!r.e && r.v.auth === 'Bearer old-at', 'request used the still-valid token');
  assert.ok(r.ms >= 2800 && r.ms < 4500, `waited ~3 s for the renewal, not for its full timeout (${r.ms} ms)`);
  console.log('ok   hung refresh: the request waits ~3 s, then goes with the current token');
  await new Promise((res) => setTimeout(res, 7500)); // let the hung refresh hit its own 10 s limit

  // 2 refresh works: the request carries the new token
  login(20); refreshMode = 'ok'; seen.length = 0;
  r = await t(() => get<any>('/ping'));
  assert.ok(!r.e && r.v.auth === 'Bearer new-at' && r.ms < 500, JSON.stringify(r));
  console.log('ok   refresh ok: the request carries the new token, no delay');

  // 3 expired token (401) and the refresh is slow/down: NOT signed out, a retryable error
  login(3600); refreshMode = 'down'; pingStatus = (a) => (a === 'Bearer old-at' ? 401 : 200);
  r = await t(() => get<any>('/ping'));
  assert.ok(r.e?.code === 'NETWORK_ERROR' && getSession()?.refresh_token === 'old-rt', 'kept the session');
  console.log('ok   401 + auth service down: error, session kept');

  // 4 expired token and the refresh token is rejected: signed out
  login(3600); refreshMode = 'denied';
  r = await t(() => get<any>('/ping'));
  assert.ok(r.e?.code === 'UNAUTHORIZED' && getSession() === null, 'signed out');
  console.log('ok   401 + refresh token rejected: session cleared');

  // 5 expired token and a refresh that hangs: gives up after 10 s, session kept
  login(3600); refreshMode = 'hang';
  r = await t(() => get<any>('/ping'));
  assert.ok(r.e?.code === 'NETWORK_ERROR' && r.ms >= 9500 && r.ms < 12000 && getSession()?.refresh_token === 'old-rt', JSON.stringify({ ms: r.ms, e: r.e?.code }));
  console.log('ok   401 + hung refresh: gives up after 10 s (was: minutes), session kept');

  // 6 renewed token on the retry
  login(3600); refreshMode = 'ok';
  r = await t(() => get<any>('/ping'));
  assert.ok(!r.e && r.v.auth === 'Bearer new-at', JSON.stringify(r));
  console.log('ok   401 + refresh ok: the request is repeated with the new token');

  console.log('ALL PASS (api refresh)');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
