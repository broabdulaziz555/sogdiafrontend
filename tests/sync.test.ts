// Run: npx tsx tests/sync.test.ts
import { EMPTY_LEDGER, SETTLE_MS, deriveView, reconcile, withRetry, type Ledger, type Snapshot } from '../src/components/terminal/sync';
import type { Account, AccountMetrics, Position } from '../src/lib/types';

let fails = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)); if (!cond) fails++; };

const account = { id: 'a', size: 10000, balance: 10000, equity: 10000, daily_start_balance: 10000, status: 'active' } as unknown as Account;
const baseMetrics = { equity: 10000, unrealized_pnl: 0, used_margin: 0, free_margin: 10000, open_positions: 0, daily_dd_limit: 9600, max_dd_limit: 9400, daily_dd_remaining: 400, max_dd_remaining: 600, daily_dd_used_pct: 0, max_dd_used_pct: 0, profit_target: 10800, profit_pct: 0, target_reached: false } as AccountMetrics;
const pos = (id: string, margin: number, pnl: number): Position => ({ id, account_id: 'a', symbol: 'BTCUSDT', side: 'long', leverage: 10, margin, position_size: margin * 10, quantity: 1, entry_price: 100, liquidation_price: 90, mark_price: 100, unrealized_pnl: pnl, unrealized_pnl_pct: 0, status: 'open', created_at: new Date().toISOString() });
const snap = (positions: Position[], startedAt: number, balance = 10000): Snapshot => ({ positions, account: { ...account, balance } as Account, metrics: baseMetrics, startedAt });
const led = (p: Partial<Ledger>): Ledger => ({ ...EMPTY_LEDGER, ...p });
const openIntent = (id: string, p: object = {}) => ({ id, pos: pos(id, 500, 1), body: {} as never, createdAt: 1000, phase: 'sending' as const, ...p });

(async () => {
  // ── reconcile: opens
  let r = reconcile(led({ opens: { x: openIntent('x') } }), snap([pos('x', 500, 2)], 2000));
  check('open: listed by server -> intent dropped', Object.keys(r.ledger.opens).length === 0);

  r = reconcile(led({ opens: { x: openIntent('x') } }), snap([], 9_999_999));
  check('open: still sending is NEVER dropped by a poll that does not list it', !!r.ledger.opens.x);

  r = reconcile(led({ opens: { x: openIntent('x', { phase: 'acked', ackedAt: 5000 }) } }), snap([], 4000));
  check('open: stale poll (started before the ack) cannot remove a confirmed position', !!r.ledger.opens.x);

  r = reconcile(led({ opens: { x: openIntent('x', { phase: 'acked', ackedAt: 5000 }) } }), snap([], 6000));
  check('open: poll started after the ack without it -> it was closed meanwhile, dropped silently', !r.ledger.opens.x && r.dropped.notPlaced.length === 0);

  r = reconcile(led({ opens: { x: openIntent('x', { phase: 'lost', lostAt: 5000 }) } }), snap([], 5000 + SETTLE_MS - 1));
  check('open: lost, poll too early to prove anything -> kept', !!r.ledger.opens.x);
  r = reconcile(led({ opens: { x: openIntent('x', { phase: 'lost', lostAt: 5000 }) } }), snap([], 5000 + SETTLE_MS + 1));
  check('open: lost and a later poll proves the server never stored it -> reported', !r.ledger.opens.x && r.dropped.notPlaced.length === 1);
  r = reconcile(led({ opens: { x: openIntent('x', { phase: 'lost', lostAt: 5000 }) } }), snap([pos('x', 500, 0)], 5000 + SETTLE_MS + 1));
  check('open: lost but the server did store it -> adopted, no error', !r.ledger.opens.x && r.dropped.notPlaced.length === 0);

  // ── reconcile: closes
  r = reconcile(led({ closes: { x: { id: 'x', createdAt: 1, phase: 'sending' } } }), snap([], 10));
  check('close: server no longer lists it -> settled', Object.keys(r.ledger.closes).length === 0);
  r = reconcile(led({ closes: { x: { id: 'x', createdAt: 1, phase: 'sending' } } }), snap([pos('x', 1, 1)], 10));
  check('close: server still lists it while sending -> stays hidden', !!r.ledger.closes.x);
  r = reconcile(led({ closes: { x: { id: 'x', createdAt: 1, phase: 'lost', lostAt: 100 } } }), snap([pos('x', 1, 1)], 100 + SETTLE_MS + 1));
  check('close: never applied -> reported and position comes back', !r.ledger.closes.x && r.dropped.notClosed.length === 1);
  r = reconcile(led({ opens: { x: openIntent('x') }, closes: { x: { id: 'x', createdAt: 1, phase: 'sending' } } }), snap([], 10));
  check('close of a position still being stored waits for the open', !!r.ledger.closes.x && !!r.ledger.opens.x);

  // ── view
  let v = deriveView(snap([pos('a', 1000, 50), pos('b', 2000, -20)], 1, 10000), EMPTY_LEDGER);
  check('view: plain snapshot', v.positions.length === 2 && v.metrics.used_margin === 3000 && v.metrics.unrealized_pnl === 30 && v.metrics.equity === 10030 && v.metrics.free_margin === 7000, v.metrics);

  v = deriveView(snap([pos('a', 1000, 50), pos('b', 2000, -20)], 1, 10000), led({ closes: { a: { id: 'a', createdAt: 1, phase: 'sending' }, b: { id: 'b', createdAt: 1, phase: 'sending' } } }));
  check('view: SCREENSHOT CASE — all positions closing: list empty AND panel shows no margin / profit', v.positions.length === 0 && v.metrics.used_margin === 0 && v.metrics.unrealized_pnl === 0 && v.metrics.open_positions === 0, v.metrics);
  check('view: closing realises PnL into balance (free margin = new balance)', v.account.balance === 10030 && v.metrics.free_margin === 10030 && v.metrics.equity === 10030, v);

  v = deriveView(snap([pos('a', 1000, 50)], 1, 10000), led({ closes: { a: { id: 'a', createdAt: 1, phase: 'acked', ackedAt: 5, pnl: 47.5 } } }));
  check('view: acked close uses the realised PnL from the server', v.account.balance === 10047.5, v.account);

  v = deriveView(snap([pos('a', 1000, 0)], 1), led({ opens: { n: openIntent('n') } }));
  check('view: unconfirmed open shown first, margin counted, flagged', v.positions[0].id === 'n' && v.positions.length === 2 && v.metrics.used_margin === 1500 && v.unconfirmed.has('n'), v);

  v = deriveView(snap([pos('n', 500, 1)], 1), led({ opens: { n: openIntent('n', { phase: 'acked', ackedAt: 3, confirmed: pos('n', 500, 1) }) } }));
  check('view: same id from server and ledger is shown once', v.positions.length === 1 && v.metrics.used_margin === 500, v.positions);

  v = deriveView(snap([], 1), led({ opens: { n: openIntent('n'), }, closes: { n: { id: 'n', createdAt: 5, phase: 'sending' } } }));
  check('view: closing a not-yet-stored position hides it, no phantom margin', v.positions.length === 0 && v.metrics.used_margin === 0, v.metrics);

  // ── end-to-end story: slow server, out-of-order polls
  let ledger = led({ opens: { z: openIntent('z') } });
  const steps: [string, Snapshot][] = [
    ['poll before server stored it', snap([], 1500)],
    ['poll while request still hanging', snap([], 30_000)],
  ];
  for (const [n, s] of steps) { ledger = reconcile(ledger, s).ledger; check(`story: ${n} -> position still on screen`, deriveView(s, ledger).positions.some((p) => p.id === 'z')); }
  ledger = { ...ledger, opens: { z: { ...ledger.opens.z, phase: 'acked', ackedAt: 40_000, confirmed: pos('z', 500, 1) } } };
  const stale = snap([], 39_000);
  ledger = reconcile(ledger, stale).ledger;
  check('story: stale poll that finishes after the ack changes nothing', deriveView(stale, ledger).positions.some((p) => p.id === 'z'));
  ledger = reconcile(ledger, snap([pos('z', 500, 1)], 41_000)).ledger;
  check('story: server lists it -> ledger empty, still one position', Object.keys(ledger.opens).length === 0 && deriveView(snap([pos('z', 500, 1)], 41_000), ledger).positions.length === 1);

  // ── retry
  let calls = 0; const waits: number[] = []; let t = 0;
  const sleep = async (ms: number) => { waits.push(ms); t += ms; };
  let res = await withRetry(async () => { calls++; if (calls < 4) throw new Error('timeout'); return 'ok'; }, { budgetMs: 90_000, isDefinitive: () => false, sleep, now: () => t });
  check('retry: succeeds after transient failures with backoff', res.ok && calls === 4 && waits.join() === '800,1600,3200', { calls, waits });
  calls = 0; res = await withRetry(async () => { calls++; throw new Error('refused'); }, { budgetMs: 90_000, isDefinitive: () => true, sleep, now: () => t });
  check('retry: definitive refusal is not retried', !res.ok && res.definitive && calls === 1);
  calls = 0; t = 0; res = await withRetry(async () => { calls++; t += 15_000; throw new Error('timeout'); }, { budgetMs: 90_000, isDefinitive: () => false, sleep, now: () => t });
  check('retry: gives up inside the budget, not definitive', !res.ok && !res.definitive && calls >= 4 && t <= 110_000, { calls, t });

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
