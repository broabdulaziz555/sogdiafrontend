/* eslint-disable */
// Run: npx tsx tests/terminal-provider.test.tsx   (jsdom + a scriptable fake server; real provider, real SWR, real store)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage; g.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement; g.Node = dom.window.Node; g.MutationObserver = dom.window.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.requestAnimationFrame = (cb: any) => setTimeout(cb, 0); g.cancelAnimationFrame = clearTimeout;

import React, { useEffect } from 'react';
import { render, act, cleanup } from '@testing-library/react';
(globalThis as any).React = React;

// ── scriptable fake server ────────────────────────────────────────────────────────────────────────────
const ACC = '11111111-1111-4111-8111-111111111111';
type Row = { id: string; symbol: string; side: 'long' | 'short'; margin: number; leverage: number; created_at: string; pnl?: number };
const srv = {
  balance: 10000, open: [] as Row[], closed: [] as Row[],
  // fault injection: return a function that decides per request
  fault: (_path: string, _n: number): 'ok' | 'drop' | 'hang' | 'slow' | 'stale' | { error: string; status: number } => 'ok',
  counts: {} as Record<string, number>, openStores: 0, epoch: 0, pending: [] as any[], featureOff: false, pendingStores: 0, strings: false,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const posOf = (r: Row) => ({ id: r.id, account_id: ACC, symbol: r.symbol, side: r.side, leverage: r.leverage, margin: r.margin, position_size: r.margin * r.leverage, quantity: 1, entry_price: 100, liquidation_price: 90, mark_price: 100, unrealized_pnl: 0, unrealized_pnl_pct: 0, status: 'open', created_at: r.created_at });
function snapshot() {
  const used = srv.open.reduce((a, r) => a + r.margin, 0);
  return {
    positions: [...srv.open].reverse().map(posOf).map((x: any) => (srv.strings ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) : x)), pending: srv.pending.map((p) => ({ ...p })), liquidated: [],
    account: { id: ACC, size: 10000, balance: srv.balance, equity: srv.balance, daily_start_balance: 10000, status: 'active', max_leverage: 200, daily_dd_pct: 4, max_dd_pct: 6 },
    metrics: { equity: srv.balance, unrealized_pnl: 0, used_margin: used, free_margin: srv.balance - used, open_positions: srv.open.length, daily_dd_limit: 9600, max_dd_limit: 9400, daily_dd_remaining: 0, max_dd_remaining: 0, daily_dd_used_pct: 0, max_dd_used_pct: 0, profit_target: 10800, profit_pct: 0, target_reached: false },
    risk: { breached: false, reason: null, status: 'active' }, server_time: Date.now(),
  };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
g.fetch = async (input: any, init: any = {}) => {
  const url = new URL(String(input), 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '');
  srv.counts[path] = (srv.counts[path] ?? 0) + 1;
  const n = srv.counts[path];
  const f = srv.fault(path, n);
  const ep = srv.epoch;
  const respond = async (): Promise<Response> => {
    const body = init.body ? JSON.parse(init.body) : {};
    if (path === '/trade/positions') { if (process.env.DBG) console.log('   snap@', srv.epoch, srv.open.map((r) => r.id.slice(-1))); return json({ ok: true, data: snapshot() }); }
    if (path === '/trade/open') {
      if (body.margin > srv.balance - srv.open.reduce((a: number, r: Row) => a + r.margin, 0)) return json({ ok: false, error: { code: 'INSUFFICIENT_MARGIN', message: 'no margin' } }, 409);
      let r = srv.open.find((x) => x.id === body.order_id);
      if (process.env.DBG) console.log('   open@', srv.epoch, ep, body.order_id.slice(0, 2));
      const replayed = !!r;
      if (!r) { r = { id: body.order_id, symbol: body.symbol, side: body.side, margin: body.margin, leverage: body.leverage, created_at: new Date().toISOString() }; srv.open.push(r); srv.openStores++; }
      return json({ ok: true, data: { order: posOf(r), replayed } });
    }
    if (path === '/trade/close') {
      const i = srv.open.findIndex((x) => x.id === body.order_id);
      if (i < 0) return json({ ok: false, error: { code: 'ORDER_NOT_OPEN', message: 'closed' } }, 409);
      const [r] = srv.open.splice(i, 1); r.pnl = 5; srv.closed.push(r); srv.balance += 5;
      return json({ ok: true, data: { order: { pnl: 5, close_price: 100 } } });
    }
    if (path === '/trade/pending') {
      if (srv.featureOff) return json({ ok: false, error: { code: 'FEATURE_UNAVAILABLE', message: 'off' } }, 501);
      if (!srv.pending.some((x) => x.id === body.id)) { srv.pending.push({ id: body.id, account_id: body.account_id, symbol: body.symbol, side: body.side, kind: body.kind, trigger_price: body.trigger_price, leverage: body.leverage, margin: body.margin, take_profit: null, stop_loss: null, status: 'working', error: null, created_at: new Date().toISOString() }); srv.pendingStores++; }
      return json({ ok: true, data: { order: { id: body.id } } });
    }
    if (path === '/trade/pending/cancel') { srv.pending = srv.pending.filter((x) => x.id !== body.id); return json({ ok: true, data: { id: body.id } }); }
    if (path === '/trade/history') return json({ ok: true, data: { orders: [], total: 0, limit: 25, offset: 0, stats: { trades: 0, wins: 0, losses: 0, win_rate: 0, net_pnl: 0 } } });
    return json({ ok: false, error: { code: 'NOT_FOUND', message: path } }, 404);
  };
  if (f === 'hang') { await new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))); }
  if (f === 'slow') await sleep(700);
  if (f === 'stale') { const early = await respond(); await sleep(700); return early; }
  if (ep !== srv.epoch) throw new TypeError('request from a previous scenario');
  if (typeof f === 'object') return json({ ok: false, error: { code: f.error, message: f.error } }, f.status);
  const res = await respond(); // the server DID process it
  if (f === 'drop') throw new TypeError('network dropped the reply');
  return res;
};

// ── imports that need the DOM globals ────────────────────────────────────────────────────────────────
(async () => {
  const { TerminalDataProvider, useTerminalData, TUNING } = await import('../src/components/terminal/data');
  const { useTerminal } = await import('../src/components/terminal/store');
  const { ToastProvider } = await import('../src/components/ui/Toast');
  const { SWRConfig } = await import('swr');

  TUNING.tradeMs = 400;
  useTerminal.setState({ symbol: 'BTCUSDT', last: 100, prices: { BTCUSDT: { symbol: 'BTCUSDT', price: 100, bid: 99.95, ask: 100.05 } as any } });

  let fails = 0;
  const check = (name: string, cond: boolean, extra?: unknown) => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)); if (!cond) fails++; };

  let api!: ReturnType<typeof useTerminalData>;
  const renders: { positions: number; open: number; used: number; sumMargin: number; ids?: string; tree?: number }[] = [];
  let treeCounter = 0;
  let mark = 0;
  let seq = 0; // a fresh account id per scenario keeps SWR's global cache from leaking one scenario into the next
  function Probe() {
    const tree = React.useRef(++treeCounter).current;
    const d = useTerminalData();
    api = d;
    useEffect(() => {
      const sum = Math.round(d.positions.reduce((a, p) => a + p.margin, 0) * 100) / 100;
      if (d.metrics) renders.push({ tree, ids: d.positions.map((p) => p.id.slice(0, 2) + p.id.slice(-1)).join(','), positions: d.positions.length, open: d.metrics.open_positions, used: d.metrics.used_margin, sumMargin: sum });
    });
    return null;
  }
  const mount = async () => {
    cleanup();
    srv.epoch++; srv.pending = []; srv.featureOff = false; srv.pendingStores = 0; srv.balance = 10000; srv.open = []; srv.closed = []; srv.counts = {}; srv.openStores = 0; srv.fault = () => 'ok';
    renders.length = 0; useTerminal.setState({ pending: [] });
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><ToastProvider><TerminalDataProvider accountId={`${ACC.slice(0, -2)}${String(++seq).padStart(2, '0')}`}><Probe /></TerminalDataProvider></ToastProvider></SWRConfig>);
    await act(async () => { await sleep(150); });
  };
  const settle = async (ms = 300) => { await act(async () => { await sleep(ms); }); };
  const consistent = () => renders.every((r) => r.positions === r.open && Math.abs(r.sumMargin - r.used) < 0.005);
  const open = (id: string, margin = 500) => api.openPosition({ id, symbol: 'BTCUSDT', side: 'long', leverage: 10, margin });

  // A — open: spinner while the server works, nothing on screen until it has answered, then the table is re-read
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? 'slow' : 'ok');
  let p!: Promise<any>;
  await act(async () => { p = open('aaaaaaaa-0000-4000-8000-000000000001'); await sleep(100); });
  check('A: request in flight is reported (button spinner)', api.inFlight === 1, api.inFlight);
  check('A: nothing is drawn before the server has answered', api.positions.length === 0 && srv.open.length === 0, { shown: api.positions.length });
  let oa: any;
  await act(async () => { oa = await p; });
  check('A: 200 -> position is in the table when the request resolves (table re-read)', oa.ok && api.positions.length === 1 && api.inFlight === 0, { oa: oa.ok, shown: api.positions.length });
  await settle(300);
  check('A: still exactly one position, list and panel agree on every render', api.positions.length === 1 && srv.open.length === 1 && consistent(), renders.filter((r) => r.positions !== r.open));
  check('A: the open request was sent once (no retries)', srv.counts['/trade/open'] === 1, srv.counts);

  // B — reply lost (server stored the order): reported as timed out, NOT retried, table shows what the database holds
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? 'drop' : 'ok');
  let ob: any;
  await act(async () => { ob = await open('bbbbbbbb-0000-4000-8000-000000000001'); });
  await settle(300);
  check('B: reported as timed-out, with no automatic retry', ob.ok === false && ob.timedOut === true && srv.counts['/trade/open'] === 1, { ob: ob.timedOut, counts: srv.counts });
  check('B: the position that exists on the server is shown (re-read after the failure)', srv.open.length === 1 && api.positions.length === 1, { stored: srv.open.length, shown: api.positions.length });

  // C — no answer at all (deadline): nothing was stored, nothing is drawn, no ghost, no retry
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? 'hang' : 'ok');
  let oc: any;
  await act(async () => { oc = await open('cccccccc-0000-4000-8000-000000000001'); });
  await settle(300);
  check('C: deadline -> timedOut, table unchanged and empty', oc.ok === false && oc.timedOut === true && api.positions.length === 0 && srv.counts['/trade/open'] === 1, { oc: oc.timedOut, shown: api.positions.length, counts: srv.counts });
  check('C: trading is possible again (no request stuck)', api.inFlight === 0, api.inFlight);

  // D — server error (500): not a timeout, reported with its error, table unchanged
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? { error: 'INTERNAL_ERROR', status: 500 } : 'ok');
  let od: any;
  await act(async () => { od = await open('dddddddd-0000-4000-8000-000000000001'); });
  check('D: 500 -> failure with the server error, not a timeout', od.ok === false && od.timedOut === false && od.error?.code === 'INTERNAL_ERROR', od);
  check('D: nothing on screen', api.positions.length === 0);

  // E — refusal (margin): error returned, table unchanged
  await mount();
  let oe: any;
  await act(async () => { oe = await open('eeeeeeee-0000-4000-8000-000000000001', 999_999); });
  check('E: INSUFFICIENT_MARGIN -> rejected, nothing opened', oe.ok === false && !oe.timedOut && oe.error?.code === 'INSUFFICIENT_MARGIN' && api.positions.length === 0 && srv.open.length === 0, oe);

  // F — close: the row stays (with a spinner) until the server confirms
  await mount();
  await act(async () => { await open('ffffffff-0000-4000-8000-000000000001'); await open('ffffffff-0000-4000-8000-000000000002'); }); await settle(300);
  check('F: two positions open', api.positions.length === 2 && api.metrics?.used_margin === 1000, api.metrics);
  srv.fault = (path) => (path === '/trade/close' ? 'slow' : 'ok');
  let pc!: Promise<any[]>;
  mark = renders.length;
  await act(async () => { pc = api.closePositions(['ffffffff-0000-4000-8000-000000000001']); await sleep(200); });
  check('F: while the close is on its way the row is still listed and shows a spinner', api.positions.length === 2 && api.isClosing('ffffffff-0000-4000-8000-000000000001') && !api.isClosing('ffffffff-0000-4000-8000-000000000002'), { shown: api.positions.length });
  let rc: any[] = [];
  await act(async () => { rc = await pc; });
  check('F: 200 -> row gone when the request resolves, spinner off, balance includes the profit', rc[0].ok && api.positions.length === 1 && !api.isClosing('ffffffff-0000-4000-8000-000000000001') && api.account?.balance === 10005 && api.metrics?.used_margin === 500, { shown: api.positions.length, bal: api.account?.balance });
  check('F: the list never dropped below 1 in a committed render while closing', renders.slice(mark).every((r) => r.positions >= 1), renders.slice(mark).map((r) => r.positions));

  // G — close failures leave the row exactly where it was
  await mount();
  await act(async () => { await open('99999999-0000-4000-8000-000000000001'); }); await settle(300);
  srv.fault = (path) => (path === '/trade/close' ? { error: 'INTERNAL_ERROR', status: 500 } : 'ok');
  let rg: any[] = [];
  await act(async () => { rg = await api.closePositions(['99999999-0000-4000-8000-000000000001']); }); await settle(300);
  check('G: server error on close -> reported, position still listed', !rg[0].ok && api.positions.length === 1 && srv.open.length === 1, { rg, shown: api.positions.length });
  srv.fault = (path) => (path === '/trade/close' ? 'hang' : 'ok');
  await act(async () => { rg = await api.closePositions(['99999999-0000-4000-8000-000000000001']); }); await settle(300);
  check('G: close timed out -> reported, position still listed, spinner off', !rg[0].ok && api.positions.length === 1 && !api.isClosing('99999999-0000-4000-8000-000000000001'), { rg, shown: api.positions.length });
  srv.fault = (path) => (path === '/trade/close' ? 'drop' : 'ok');
  await act(async () => { rg = await api.closePositions(['99999999-0000-4000-8000-000000000001']); }); await settle(300);
  check('G: reply lost but the server did close it -> the re-read removes the row', srv.open.length === 0 && api.positions.length === 0, { stored: srv.open.length, shown: api.positions.length });

  // H — double tap: one request per id
  await mount();
  await act(async () => { await Promise.all([open('88888888-0000-4000-8000-000000000001'), open('88888888-0000-4000-8000-000000000001')]); }); await settle(300);
  check('H: same order sent twice = one request, one position', srv.open.length === 1 && srv.counts['/trade/open'] === 1 && api.positions.length === 1, { stored: srv.open.length, counts: srv.counts });
  await act(async () => { await Promise.all([api.closePositions(['88888888-0000-4000-8000-000000000001']), api.closePositions(['88888888-0000-4000-8000-000000000001'])]); }); await settle(300);
  check('H: double close = one request', srv.closed.length === 1 && srv.counts['/trade/close'] === 1 && api.positions.length === 0, srv.counts);

  // I — a slow poll that started BEFORE the open and answers AFTER it must not wipe the new position
  await mount();
  srv.fault = (path, n) => (path === '/trade/positions' && n === srv.counts['/trade/positions'] ? 'stale' : 'ok');
  srv.fault = (() => { const base = srv.counts['/trade/positions'] ?? 0; return (path: string, n: number) => (path === '/trade/positions' && n === base + 1 ? 'stale' : 'ok'); })();
  let slowPoll!: Promise<any>;
  await act(async () => { slowPoll = api.refresh(); await sleep(50); });
  mark = renders.length;
  await act(async () => { await open('77777777-0000-4000-8000-000000000001'); });
  await act(async () => { await sleep(1000); await slowPoll; });
  const tlI = renders.slice(mark).map((r) => r.positions);
  check('I: position is never dropped by the late stale poll (every committed render after the 200)', tlI.length > 0 && tlI.every((n) => n === 1) && api.positions.length === 1, tlI);

  // J — limit / stop orders: server list is the truth
  const pend = () => api.placePending({ symbol: 'BTCUSDT', side: 'long', kind: 'limit', trigger: 90, leverage: 10, margin: 300, tp: null, sl: null });
  await mount();
  let pr: any;
  await act(async () => { pr = await pend(); });
  let st = useTerminal.getState().pending;
  check('J1: placed -> shown from the server list', pr.ok && srv.pending.length === 1 && st.length === 1 && st[0].server === true, { srv: srv.pending.length, st });
  const fid = srv.pending[0].id;
  srv.pending = []; srv.open.push({ id: fid, symbol: 'BTCUSDT', side: 'long', margin: 300, leverage: 10, created_at: new Date().toISOString() });
  await act(async () => { await api.refresh(); }); await settle(300);
  st = useTerminal.getState().pending;
  check('J1: after the server fills it the order is gone and the position is shown', st.length === 0 && api.positions.some((p) => p.id === fid), { st, ids: api.positions.map((p) => p.id) });

  await mount();
  srv.featureOff = true;
  await act(async () => { await pend(); }); await settle(300);
  st = useTerminal.getState().pending;
  check('J2: migration not run -> browser-side order', st.length === 1 && st[0].server === false, st);

  await mount();
  await act(async () => { await pend(); }); await settle(300);
  const cid = srv.pending[0].id;
  srv.fault = (path) => (path === '/trade/pending/cancel' ? 'slow' : 'ok');
  let cp!: Promise<void>;
  await act(async () => { cp = api.cancelPending(cid); await sleep(100); });
  check('J3: cancel is not shown until the server confirms', useTerminal.getState().pending.length === 1);
  await act(async () => { await cp; });
  check('J3: cancelled on the server and gone from the list', srv.pending.length === 0 && useTerminal.getState().pending.length === 0, { srv: srv.pending.length, st: useTerminal.getState().pending });

  // K — numbers that arrive as strings are parsed, never dropped; the response is read from `positions`
  await mount();
  await act(async () => { await open('12121212-0000-4000-8000-000000000001'); await open('12121212-0000-4000-8000-000000000002'); }); await settle(300);
  srv.strings = true;
  await act(async () => { await api.refresh(); }); await settle(300);
  const sp = api.positions;
  check('K: string numbers -> every position kept, all fields are numbers', sp.length === 2 && sp.every((x: any) => ['margin', 'entry_price', 'quantity', 'liquidation_price', 'unrealized_pnl', 'mark_price'].every((k) => typeof x[k] === 'number' && Number.isFinite(x[k]))), sp[0]);
  check('K: panel figures are finite numbers', api.metrics != null && Number.isFinite(api.metrics.equity) && api.metrics.used_margin === 1000, api.metrics);
  srv.strings = false;

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  cleanup(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
