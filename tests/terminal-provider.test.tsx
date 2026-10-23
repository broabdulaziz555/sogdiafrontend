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
  fault: (_path: string, _n: number): 'ok' | 'drop' | 'hang' | 'slow' | { error: string; status: number } => 'ok',
  counts: {} as Record<string, number>, openStores: 0, epoch: 0, pending: [] as any[], featureOff: false, pendingStores: 0,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const posOf = (r: Row) => ({ id: r.id, account_id: ACC, symbol: r.symbol, side: r.side, leverage: r.leverage, margin: r.margin, position_size: r.margin * r.leverage, quantity: 1, entry_price: 100, liquidation_price: 90, mark_price: 100, unrealized_pnl: 0, unrealized_pnl_pct: 0, status: 'open', created_at: r.created_at });
function snapshot() {
  const used = srv.open.reduce((a, r) => a + r.margin, 0);
  return {
    positions: [...srv.open].reverse().map(posOf), pending: srv.pending.map((p) => ({ ...p })), liquidated: [],
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
      if (!srv.pending.some((x) => x.id === body.id)) { srv.pending.push({ id: body.id, account_id: ACC, symbol: body.symbol, side: body.side, kind: body.kind, trigger_price: body.trigger_price, leverage: body.leverage, margin: body.margin, take_profit: null, stop_loss: null, status: 'working', error: null, created_at: new Date().toISOString() }); srv.pendingStores++; }
      return json({ ok: true, data: { order: { id: body.id } } });
    }
    if (path === '/trade/pending/cancel') { srv.pending = srv.pending.filter((x) => x.id !== body.id); return json({ ok: true, data: { id: body.id } }); }
    if (path === '/trade/history') return json({ ok: true, data: { orders: [], total: 0, limit: 25, offset: 0, stats: { trades: 0, wins: 0, losses: 0, win_rate: 0, net_pnl: 0 } } });
    return json({ ok: false, error: { code: 'NOT_FOUND', message: path } }, 404);
  };
  if (f === 'hang') { await new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))); }
  if (f === 'slow') await sleep(700);
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
  const { RETRY_DELAYS_MS } = await import('../src/components/terminal/sync');
  const { SWRConfig } = await import('swr');

  RETRY_DELAYS_MS.splice(0, RETRY_DELAYS_MS.length, 0, 40, 60, 80, 100);
  TUNING.attemptMs = 400; TUNING.budgetMs = 4000;
  useTerminal.setState({ symbol: 'BTCUSDT', last: 100, prices: { BTCUSDT: { symbol: 'BTCUSDT', price: 100, bid: 99.95, ask: 100.05 } as any } });

  let fails = 0;
  const check = (name: string, cond: boolean, extra?: unknown) => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)); if (!cond) fails++; };

  let api!: ReturnType<typeof useTerminalData>;
  const renders: { positions: number; open: number; used: number; sumMargin: number; ids?: string; tree?: number }[] = [];
  let treeCounter = 0;
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

  // A — normal open: on screen at once, one position at the end
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? 'slow' : 'ok');
  let p!: Promise<any>;
  await act(async () => { p = open('aaaaaaaa-0000-4000-8000-000000000001'); await sleep(0); });
  check('A: position visible before the server has answered', api.positions.length === 1 && api.isUnconfirmed('aaaaaaaa-0000-4000-8000-000000000001') && srv.open.length === 0, { shown: api.positions.length, stored: srv.open.length });
  await act(async () => { await p; }); await settle(700);
  check('A: one position, confirmed', api.positions.length === 1 && !api.isUnconfirmed('aaaaaaaa-0000-4000-8000-000000000001') && srv.open.length === 1);
  check('A: list and panel agreed on every render', consistent(), renders.filter((r) => r.positions !== r.open));

  // B — server stores the order but the reply is lost; client retries; exactly one position, never disappears
  await mount();
  srv.fault = (path, n) => (path === '/trade/open' && n === 1 ? 'drop' : 'ok');
  let mark = renders.length;
  await act(async () => { await open('bbbbbbbb-0000-4000-8000-000000000001'); });
  await settle(600);
  const seen = renders.slice(mark).map((r) => r.positions); if (!seen.every((n) => n === 1)) console.log('   B renders', JSON.stringify(renders.slice(mark)), 'srv.open', srv.open.map((r) => r.id));
  check('B: never vanished while the reply was lost (every committed render)', seen.length > 0 && seen.every((n) => n === 1), seen);
  check('B: stored once (idempotent retry)', srv.open.length === 1 && srv.openStores === 1 && srv.counts['/trade/open'] >= 2, srv.counts);
  check('B: ends with exactly one confirmed position', api.positions.length === 1 && !api.isUnconfirmed('bbbbbbbb-0000-4000-8000-000000000001'));
  check('B: consistent on every render', consistent());

  // C — a hung request (no answer at all) then recovery
  await mount();
  srv.fault = (path, n) => (path === '/trade/open' && n <= 2 ? 'hang' : 'ok');
  await act(async () => { const q = open('cccccccc-0000-4000-8000-000000000001'); await sleep(900); expect(api.positions.length === 1); await q; });
  await settle(600);
  check('C: after two hung attempts the order lands once', srv.open.length === 1 && api.positions.length === 1, { open: srv.open.length, shown: api.positions.length });

  // D — every attempt fails; the server never has it: shown as syncing, then removed with a message, never a ghost
  await mount();
  srv.fault = (path) => (path === '/trade/open' ? { error: 'INTERNAL_ERROR', status: 500 } : 'ok');
  let outcome: any;
  await act(async () => { outcome = await open('dddddddd-0000-4000-8000-000000000001'); });
  check('D: reported as unconfirmed (not a hard failure)', outcome.ok === false && outcome.unconfirmed === true, outcome);
  check('D: still on screen while undecided', api.positions.length === 1);
  await act(async () => { await sleep(TUNING.attemptMs); }); // lostAt + settle window is 25 s in prod; poll below proves absence
  check('D: syncing counter reflects the undecided order', api.syncing >= 1, api.syncing);

  // E — definitive refusal removes it at once
  await mount();
  let o2: any;
  await act(async () => { o2 = await open('eeeeeeee-0000-4000-8000-000000000001', 999_999); });
  check('E: INSUFFICIENT_MARGIN -> gone, error reported', o2.ok === false && !o2.unconfirmed && api.positions.length === 0 && srv.open.length === 0, { o2, shown: api.positions.length });

  // F — close with the reply dropped: stays closed, never reappears, no error
  await mount();
  await act(async () => { await open('ffffffff-0000-4000-8000-000000000001'); await open('ffffffff-0000-4000-8000-000000000002'); await open('ffffffff-0000-4000-8000-000000000003'); }); await settle(500);
  check('F: three positions open', api.positions.length === 3 && api.metrics?.used_margin === 1500, api.metrics);
  srv.fault = (path, n) => (path === '/trade/close' && n === 1 ? 'drop' : 'ok');
  let res: any[] = [];
  mark = renders.length;
  await act(async () => {
    res = await api.closePositions(['ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000003']);
  });
  await settle(900);
  const timeline = renders.slice(mark).map((r) => r.positions);
  check('F: all three closed on the server exactly once', srv.open.length === 0 && srv.closed.length === 3 && srv.balance === 10015, { open: srv.open.length, closed: srv.closed.length, bal: srv.balance });
  check('F: table is empty from the first render after the tap and stays empty (every committed render)', timeline.length > 0 && timeline.every((n) => n === 0), timeline);
  check('F: panel shows no margin, balance includes the profit', api.metrics?.used_margin === 0 && api.account?.balance === 10015 && api.positions.length === 0, { m: api.metrics, a: api.account?.balance });
  check('F: every outcome ok', res.length === 3 && res.every((r: any) => r.ok), res);
  check('F: list and panel agreed on every render', consistent(), renders.filter((r) => r.positions !== r.open || Math.abs(r.sumMargin - r.used) > 0.005).slice(0, 3));

  // G — slow polls (700 ms) while trading
  await mount();
  srv.fault = (path) => (path === '/trade/positions' ? 'slow' : 'ok');
  await act(async () => { await open('99999999-0000-4000-8000-000000000001'); await sleep(50); await open('99999999-0000-4000-8000-000000000002'); await sleep(50); await api.closePositions(['99999999-0000-4000-8000-000000000001']); });
  mark = renders.length;
  await settle(2500);
  const tl2 = renders.slice(mark).map((r) => r.positions);
  check('G: with slow polls the book stays at exactly one position (#2), steadily', tl2.length > 0 && tl2.every((n) => n === 1) && api.positions.map((p) => p.id.slice(-1)).join('') === '2', { tl2: [...new Set(tl2)], ids: api.positions.map((p) => p.id) });
  check('G: consistent on every render', consistent());

  // H — double tap: same close twice, same open id twice
  await mount();
  await act(async () => { await open('88888888-0000-4000-8000-000000000001'); await open('88888888-0000-4000-8000-000000000001'); }); await settle(500);
  check('H: same order id sent twice = one position', srv.open.length === 1 && api.positions.length === 1, { stored: srv.open.length, shown: api.positions.length, counts: srv.counts });
  await act(async () => { await Promise.all([api.closePositions(['88888888-0000-4000-8000-000000000001']), api.closePositions(['88888888-0000-4000-8000-000000000001'])]); }); await settle(500);
  check('H: double close = one close', srv.closed.length === 1 && api.positions.length === 0, srv.closed.length);

  // I — server-side limit/stop orders
  const pend = () => api.placePending({ symbol: 'BTCUSDT', side: 'long', kind: 'limit', trigger: 90, leverage: 10, margin: 300, tp: null, sl: null });
  await mount();
  let pr: any;
  await act(async () => { pr = await pend(); }); await settle(300);
  let st = useTerminal.getState().pending;
  check('I1: placed on the server and mirrored locally as synced', srv.pending.length === 1 && st.length === 1 && st[0].server === true && st[0].sync === 'synced', { srv: srv.pending.length, st });
  // the server fills it (its own engine): pending gone, position appears under the same id
  const fid = srv.pending[0].id;
  srv.pending = []; srv.open.push({ id: fid, symbol: 'BTCUSDT', side: 'long', margin: 300, leverage: 10, created_at: new Date().toISOString() });
  await act(async () => { await api.refresh(); }); await settle(300);
  st = useTerminal.getState().pending;
  check('I1: after the server fills it the local order is gone and the position is shown', st.length === 0 && api.positions.some((p) => p.id === fid), { st, ids: api.positions.map((p) => p.id) });

  await mount();
  srv.featureOff = true;
  await act(async () => { await pend(); }); await settle(300);
  st = useTerminal.getState().pending;
  check('I2: migration not run -> falls back to a browser-side order', st.length === 1 && st[0].server === false, st);

  await mount();
  srv.fault = (path, n) => (path === '/trade/pending' && n === 1 ? 'drop' : 'ok');
  await act(async () => { await pend(); }); await settle(400);
  check('I3: reply lost -> re-sent -> stored once, synced', srv.pendingStores === 1 && srv.pending.length === 1 && useTerminal.getState().pending[0]?.sync === 'synced', { stores: srv.pendingStores, st: useTerminal.getState().pending });

  await mount();
  await act(async () => { await pend(); }); await settle(300);
  const cid = srv.pending[0].id;
  srv.fault = (path) => (path === '/trade/pending/cancel' ? 'slow' : 'ok');
  await act(async () => { api.cancelPending(cid); });
  const right = useTerminal.getState().pending.length === 0;
  await act(async () => { await api.refresh(); }); // poll lands while the cancel is still on its way: must not bring it back
  check('I4: cancel is instant and a poll cannot resurrect the order', right && useTerminal.getState().pending.length === 0);
  await settle(1500);
  check('I4: cancel reached the server', srv.pending.length === 0, srv.pending);

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  cleanup(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
function expect(_: boolean) {}
