'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Info, Keyboard, ShieldCheck } from 'lucide-react';
import { post, errMsg, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, fmtSigned, fmtUsd, priceDecimals, qtyDecimals } from '@/lib/format';
import type { Account, AccountMetrics, Position, Side } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { SiteLink } from '@/components/ui/SiteLink';
import { EXECUTION_PATH, EXECUTION_SHORT } from '@/lib/legal';
import { useTerminalData } from './data';
import { beep } from './sound';
import { useTerminal } from './store';
import { ticketApi } from './ticketApi';
import { ddUsage } from './risk';

type OType = 'market' | 'limit' | 'stop';
const LEV_PRESETS = [1, 5, 10, 25, 50, 100, 200];
const PCTS = [10, 25, 50, 75, 100];

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const floorCents = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

function NumInput({ id, value, onChange, suffix, placeholder, invalid, disabled, inputRef, step }: { id: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string; invalid?: boolean; disabled?: boolean; inputRef?: React.Ref<HTMLInputElement>; step?: string }) {
  return (
    <div className={cn('relative flex h-10 items-center rounded-xl border bg-panel2/80 max-lg:h-11 transition focus-within:border-accent/70 focus-within:ring-4 focus-within:ring-accent/10', invalid ? 'border-down' : 'border-line hover:border-line2', disabled && 'opacity-50')}>
      <input
        id={id}
        ref={inputRef}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        data-step={step}
        onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) onChange(v); }}
        className="num h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-subtle max-lg:text-base"
      />
      {suffix && <span className="pr-3 text-xs text-subtle">{suffix}</span>}
    </div>
  );
}

function Row({ k, v, tone, tip }: { k: string; v: React.ReactNode; tone?: 'up' | 'down' | 'warn'; tip?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs" title={tip}>
      <span className="text-subtle">{k}</span>
      <span className={cn('num font-mono', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</span>
    </div>
  );
}

function OrderTicketInner({ initialSide, onPlaced }: { initialSide?: Side; onPlaced?: () => void }) {
  const toast = useToast();
  const { accountId, account, metrics, positions, refresh, applyOpened } = useTerminalData();
  const symbol = useTerminal((s) => s.symbol);
  const px = useTerminal((s) => s.prices[s.symbol]);
  const lev = useTerminal((s) => s.leverage);
  const confirmOrders = useTerminal((s) => s.confirmOrders);
  const soundOn = useTerminal((s) => s.soundOn);
  const picked = useTerminal((s) => s.pickedPrice);
  const set = useTerminal((s) => s.set);
  const addPending = useTerminal((s) => s.addPending);

  const [side, setSide] = useState<Side>(initialSide ?? 'long');
  const [type, setType] = useState<OType>('market');
  const [margin, setMargin] = useState('');
  const [price, setPrice] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [tpslOpen, setTpslOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Side | null>(null);
  const [touched, setTouched] = useState(false);
  // free-text buffer for the leverage box so the field can be emptied and retyped (null = mirror the store)
  const [levText, setLevText] = useState<string | null>(null);
  const marginRef = useRef<HTMLInputElement>(null);

  const base = symbol.replace('USDT', '');
  const maxLev = Math.min(200, account?.max_leverage ?? 200);
  const leverage = Math.min(lev, maxLev);
  const free = metrics?.free_margin ?? account?.equity ?? 0;
  const tradable = account?.status === 'active';

  // click on the order book fills the price and flips to a limit order
  useEffect(() => {
    if (!picked) return;
    setPrice(String(picked.price));
    setType((t) => (t === 'market' ? 'limit' : t));
  }, [picked]);

  // reset price-bound fields when the instrument changes
  useEffect(() => { setPrice(''); setTp(''); setSl(''); setTouched(false); }, [symbol]);

  const last = px?.price ?? null; // 2 s engine price — the ticket must not re-render on every trade tick
  const bid = px?.bid ?? null;
  const ask = px?.ask ?? null;
  const fillNow = side === 'long' ? ask : bid;
  const triggerPx = num(price);
  const entry = type === 'market' ? fillNow : Number.isFinite(triggerPx) ? triggerPx : null;
  const dp = priceDecimals(entry ?? last ?? 1);

  const m = num(margin);
  const size = Number.isFinite(m) ? m * leverage : NaN;
  const qty = entry && Number.isFinite(size) ? size / entry : NaN;
  const liq = entry ? (side === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage)) : null;
  const liqDistPct = entry && liq ? (Math.abs(entry - liq) / entry) * 100 : null;
  const pctOfFree = free > 0 && Number.isFinite(m) ? Math.min(100, (m / free) * 100) : 0;
  const spreadCost = Number.isFinite(size) ? size * 0.0005 * 2 : NaN;

  const tpN = num(tp), slN = num(sl);
  const errors = useMemo(() => {
    const e: { margin?: string; price?: string; tp?: string; sl?: string } = {};
    if (!Number.isFinite(m) || m <= 0) e.margin = 'Enter the margin to commit.';
    else if (m > free + 1e-9) e.margin = `Exceeds free margin (${fmtUsd(free)}).`;
    else if (m < 1) e.margin = 'Minimum margin is 1 USDT.';
    if (type !== 'market') {
      if (!Number.isFinite(triggerPx) || triggerPx <= 0) e.price = 'Enter a trigger price.';
      else if (ask != null && bid != null) {
        if (type === 'limit' && side === 'long' && triggerPx >= ask) e.price = `Buy limit must be below ask (${fmtPrice(ask)}).`;
        if (type === 'limit' && side === 'short' && triggerPx <= bid) e.price = `Sell limit must be above bid (${fmtPrice(bid)}).`;
        if (type === 'stop' && side === 'long' && triggerPx <= ask) e.price = `Buy stop must be above ask (${fmtPrice(ask)}).`;
        if (type === 'stop' && side === 'short' && triggerPx >= bid) e.price = `Sell stop must be below bid (${fmtPrice(bid)}).`;
      }
    }
    if (entry && liq) {
      if (Number.isFinite(tpN) && (side === 'long' ? tpN <= entry : tpN >= entry)) e.tp = side === 'long' ? 'Take-profit must be above entry.' : 'Take-profit must be below entry.';
      if (Number.isFinite(slN)) {
        if (side === 'long' ? slN >= entry : slN <= entry) e.sl = side === 'long' ? 'Stop-loss must be below entry.' : 'Stop-loss must be above entry.';
        else if (side === 'long' ? slN <= liq : slN >= liq) e.sl = 'Stop-loss is beyond the liquidation price.';
      }
    }
    return e;
  }, [m, free, type, triggerPx, ask, bid, side, entry, liq, tpN, slN]);
  const hasError = Object.keys(errors).length > 0;
  const dd = ddUsage(account, metrics);

  const riskAtSl = entry && Number.isFinite(slN) && Number.isFinite(size) ? (size * Math.abs(entry - slN)) / entry : null;
  const rewardAtTp = entry && Number.isFinite(tpN) && Number.isFinite(size) ? (size * Math.abs(tpN - entry)) / entry : null;

  const setLev = (v: number) => set({ leverage: Math.max(1, Math.min(maxLev, Math.round(v) || 1)) });
  const pickLev = (v: number) => { setLevText(null); setLev(v); };
  const setPct = (p: number) => { setMargin(free > 0 ? String(floorCents((free * p) / 100)) : ''); setTouched(true); };

  const doSubmit = useCallback(async (s: Side) => {
    if (busy) return;
    setBusy(true);
    try {
      const marginRounded = floorCents(m);
      if (type === 'market') {
        const body: Record<string, unknown> = { account_id: accountId, symbol, side: s, leverage, margin: marginRounded };
        if (Number.isFinite(tpN)) body.take_profit = tpN;
        if (Number.isFinite(slN)) body.stop_loss = slN;
        const res = await post<{ order: Position; account?: Account; metrics?: AccountMetrics }>('/trade/open', body, { timeoutMs: 25_000 });
        applyOpened(res); // the position appears immediately; the next poll only confirms it
        toast.success(`${s === 'long' ? 'Long' : 'Short'} opened · ${base}/USDT`, `${leverage}× at ${fmtPrice(res.order.entry_price)} · margin ${fmtUsd(res.order.margin)}`);
        if (soundOn) beep(s === 'long' ? 'up' : 'down');
        setMargin(''); setTp(''); setSl(''); setTouched(false);
        onPlaced?.();
      } else {
        addPending({
          id: crypto.randomUUID(), accountId, symbol, side: s, kind: type === 'limit' ? 'limit' : 'stop', trigger: triggerPx,
          leverage, margin: marginRounded, tp: Number.isFinite(tpN) ? tpN : null, sl: Number.isFinite(slN) ? slN : null, createdAt: Date.now(), status: 'working',
        });
        toast.info('Conditional order placed', `${type === 'limit' ? 'Limit' : 'Stop'} ${s} ${base}/USDT @ ${fmtPrice(triggerPx)} — kept in this browser while the terminal is open.`);
        setMargin(''); setPrice(''); setTouched(false);
        onPlaced?.();
      }
    } catch (e) {
      toast.error('Order rejected', `${errMsg(e)}${e instanceof ApiError && e.code ? ` [${e.code}]` : ''}`);
      if (e instanceof ApiError && e.code === 'TIMEOUT') void refresh(); // it may have gone through
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }, [busy, m, type, accountId, symbol, leverage, tpN, slN, triggerPx, toast, base, soundOn, refresh, applyOpened, addPending, onPlaced]);

  const request = useCallback((s: Side) => {
    setSide(s);
    setTouched(true);
    if (!tradable || hasError) { if (hasError) toast.warn('Check the order', String(Object.values(errors)[0] ?? '')); return; }
    if (confirmOrders) setConfirm(s); else void doSubmit(s);
  }, [tradable, hasError, errors, confirmOrders, doSubmit, toast]);

  // expose to hotkeys
  const reqRef = useRef(request);
  reqRef.current = request;
  useEffect(() => {
    ticketApi.submit = (s) => reqRef.current(s);
    ticketApi.cycleType = () => setType((t) => (t === 'market' ? 'limit' : t === 'limit' ? 'stop' : 'market'));
    ticketApi.focusMargin = () => marginRef.current?.focus();
    return () => { ticketApi.submit = undefined; ticketApi.cycleType = undefined; ticketApi.focusMargin = undefined; };
  }, []);

  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const sideColor = side === 'long' ? 'up' : 'down';

  return (
    <section className="flex flex-col gap-4 p-4" aria-label="Order ticket">
      {/* Long / Short */}
      <div role="tablist" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-panel2/70 p-1">
        {(['long', 'short'] as Side[]).map((s) => (
          <button key={s} role="tab" aria-selected={side === s} onClick={() => setSide(s)}
            className={cn('h-10 rounded-lg text-sm font-semibold transition-all max-lg:h-11', side === s ? (s === 'long' ? 'bg-up text-[#04140D] shadow-[0_6px_18px_-8px_rgb(var(--up)/0.8)]' : 'bg-down text-white shadow-[0_6px_18px_-8px_rgb(var(--down)/0.8)]') : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>
            {s === 'long' ? 'Buy / Long' : 'Sell / Short'}
          </button>
        ))}
      </div>

      {/* Order type */}
      <div role="tablist" aria-label="Order type" className="flex items-center gap-4 border-b border-line text-sm">
        {(['market', 'limit', 'stop'] as OType[]).map((t) => (
          <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)} className={cn('relative -mb-px h-8 font-medium capitalize transition-colors', type === t ? 'text-fg' : 'text-subtle hover:text-muted')}>
            {t}{type === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
        <span className="ml-auto text-2xs text-subtle">Avail <span className="num text-muted">{fmtUsd(free)}</span></span>
      </div>

      {/* Trigger price */}
      {type !== 'market' ? (
        <div className="space-y-1">
          <label htmlFor="t-price" className="flex justify-between text-xs text-muted"><span>{type === 'limit' ? 'Limit price' : 'Stop trigger'}</span>
            <span className="space-x-2 text-2xs text-subtle"><button type="button" className="hover:text-accent" onClick={() => bid && setPrice(String(bid))}>Bid</button><button type="button" className="hover:text-accent" onClick={() => ask && setPrice(String(ask))}>Ask</button></span></label>
          <NumInput id="t-price" value={price} onChange={(v) => { setPrice(v); setTouched(true); }} suffix="USDT" placeholder={fmtPrice(fillNow ?? last ?? 0)} invalid={!!show('price')} />
          {show('price') && <p role="alert" className="text-2xs text-down">{show('price')}</p>}
        </div>
      ) : (
        <div className="flex h-10 items-center justify-between rounded-xl border border-line/70 bg-panel2/60 px-3 text-sm">
          <span className="text-muted">Market price</span>
          <span className={cn('num font-mono', side === 'long' ? 'text-down' : 'text-up')} title={side === 'long' ? 'Longs fill at the ask' : 'Shorts fill at the bid'}>{fillNow != null ? fmtPrice(fillNow) : '—'}<span className="ml-1 text-2xs text-subtle">{side === 'long' ? 'ask' : 'bid'}</span></span>
        </div>
      )}

      {/* Leverage */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="t-lev" className="text-muted">Leverage</label>
          <div className="flex h-8 items-center rounded-lg border border-line bg-panel2/80 focus-within:border-accent/70">
            <input id="t-lev" inputMode="numeric" autoComplete="off" value={levText ?? String(leverage)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 3); setLevText(d); if (d !== '') setLev(Number(d)); }}
              onBlur={() => setLevText(null)}
              className="num w-10 bg-transparent text-right font-mono text-sm outline-none" aria-label="Leverage multiplier" />
            <span className="pl-0.5 pr-2 text-sm text-subtle">×</span>
          </div>
        </div>
        <input type="range" min={1} max={maxLev} step={1} value={leverage} onChange={(e) => pickLev(Number(e.target.value))} aria-label="Leverage slider" aria-valuetext={`${leverage}x`} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[rgb(var(--accent))]" style={{ background: `linear-gradient(to right, rgb(var(--accent)) ${((leverage - 1) / Math.max(1, maxLev - 1)) * 100}%, rgb(var(--line)) 0)` }} />
        <div className="flex justify-between">
          {LEV_PRESETS.filter((p) => p <= maxLev).map((p) => (
            <button key={p} onClick={() => pickLev(p)} className={cn('rounded-md px-1.5 py-1 text-2xs max-lg:px-1.5 max-lg:text-xs transition-colors', leverage === p ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-fg')}>{p}×</button>
          ))}
        </div>
        {leverage >= 50 && <p className="flex items-start gap-1.5 text-2xs text-warn"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />At {leverage}× a {fmtNum(100 / leverage)}% adverse move liquidates the position.</p>}
      </div>

      {/* Margin & size */}
      <div className="space-y-2">
        <div className="space-y-1">
          <label htmlFor="t-margin" className="text-xs text-muted">Margin</label>
          <NumInput id="t-margin" inputRef={marginRef} value={margin} onChange={(v) => { setMargin(v); setTouched(true); }} suffix="USDT" placeholder="0.00" invalid={!!show('margin')} disabled={!tradable} />
          {show('margin') && <p role="alert" className="text-2xs text-down">{show('margin')}</p>}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {PCTS.map((p) => (
            <button key={p} onClick={() => setPct(p)} disabled={!tradable || free <= 0} className={cn('h-7 rounded-lg border text-2xs font-medium transition-colors disabled:opacity-40', Math.round(pctOfFree) === p ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle hover:text-fg')}>{p}%</button>
          ))}
        </div>
        <div className="space-y-1">
          <label htmlFor="t-size" className="text-xs text-muted">Position size</label>
          <NumInput id="t-size" value={Number.isFinite(size) ? String(+size.toFixed(2)) : ''} onChange={(v) => { const n = num(v); setMargin(Number.isFinite(n) ? String(+(n / leverage).toFixed(2)) : ''); setTouched(true); }} suffix="USDT" placeholder="0.00" disabled={!tradable} />
          <p className="num text-right text-2xs text-subtle">{Number.isFinite(qty) ? `≈ ${fmtNum(qty, qtyDecimals(entry ?? 1) + 1)} ${base}` : `≈ — ${base}`}</p>
        </div>
      </div>

      {/* TP / SL */}
      <div className="rounded-xl border border-line/70">
        <button onClick={() => setTpslOpen((o) => !o)} aria-expanded={tpslOpen} className="flex w-full items-center justify-between px-3.5 py-3 text-xs font-medium text-muted hover:text-fg">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Take-profit / Stop-loss</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', tpslOpen && 'rotate-180')} />
        </button>
        {tpslOpen && (
          <div className="space-y-2 border-t border-line/60 p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label htmlFor="t-tp" className="text-2xs text-up">Take-profit</label><NumInput id="t-tp" value={tp} onChange={setTp} placeholder="Price" invalid={!!show('tp')} /></div>
              <div className="space-y-1"><label htmlFor="t-sl" className="text-2xs text-warn">Stop-loss</label><NumInput id="t-sl" value={sl} onChange={setSl} placeholder="Price" invalid={!!show('sl')} /></div>
            </div>
            {show('tp') && <p role="alert" className="text-2xs text-down">{show('tp')}</p>}
            {show('sl') && <p role="alert" className="text-2xs text-down">{show('sl')}</p>}
            {(riskAtSl != null || rewardAtTp != null) && (
              <div className="space-y-1 pt-1">
                {rewardAtTp != null && <Row k="Reward at TP" v={`+${fmtUsd(rewardAtTp)}`} tone="up" />}
                {riskAtSl != null && <Row k="Risk at SL" v={`−${fmtUsd(riskAtSl)}${account ? ` (${fmtNum((riskAtSl / account.equity) * 100)}% eq)` : ''}`} tone="down" />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="space-y-2 rounded-xl bg-panel2/60 p-3.5">
        <Row k="Est. entry" v={entry ? fmtPrice(entry, dp) : '—'} />
        <Row k="Liquidation price" v={liq ? fmtPrice(liq, dp) : '—'} tone="down" tip="entry × (1 ∓ 1 / leverage)" />
        <Row k="Distance to liquidation" v={liqDistPct != null ? `${fmtNum(liqDistPct)}%` : '—'} tone={liqDistPct != null && liqDistPct < 2 ? 'warn' : undefined} />
        <Row k="Spread cost (round trip)" v={Number.isFinite(spreadCost) ? `≈ ${fmtUsd(spreadCost)}` : '—'} tip="5 bps against you on entry and again on exit" />
      </div>

      {type !== 'market' && (
        <p className="flex items-start gap-1.5 rounded-xl border border-info/30 bg-info/10 px-3 py-2.5 text-2xs leading-relaxed text-info">
          <Info className="mt-px h-3 w-3 shrink-0" />
          {type === 'limit' ? 'Limit' : 'Stop'} orders are held in this browser and sent to the engine as a market order the moment the {side === 'long' ? 'ask' : 'bid'} crosses your price. They only fire while this terminal is open.
        </p>
      )}

      {!tradable && account && <p role="alert" className="rounded-xl border border-down/30 bg-down/10 px-3 py-2.5 text-xs text-down">This account is <b>{account.status}</b> and can’t open new positions.</p>}
      {tradable && dd.daily >= 0.8 && (
        <p className="flex items-start gap-1.5 text-2xs text-warn"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />You’ve used {fmtNum(dd.daily * 100, 0)}% of today’s drawdown allowance.</p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 -mb-1 border-t border-line/60 bg-panel/95 px-4 py-3 backdrop-blur">
        <Button
          variant={sideColor === 'up' ? 'up' : 'down'}
          size="lg"
          block
          loading={busy}
          disabled={!tradable}
          onClick={() => request(side)}
          className="h-12"
        >
          {side === 'long' ? 'Buy' : 'Sell'}{type === 'market' ? '' : ` ${type}`} · {base}/USDT
        </Button>
      </div>

      <p className="text-2xs leading-relaxed text-subtle">{EXECUTION_SHORT} <SiteLink site="www" path={EXECUTION_PATH} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">Execution Disclosure</SiteLink>.</p>

      <div className="flex items-center justify-between text-xs text-muted">
        <label className="flex items-center gap-2"><Switch checked={confirmOrders} onChange={(v) => set({ confirmOrders: v })} label="Confirm orders" />Confirm orders</label>
        <button onClick={() => set({ hotkeysOpen: true })} className="inline-flex items-center gap-1 text-subtle hover:text-fg max-lg:hidden"><Keyboard className="h-3.5 w-3.5" />Hotkeys<span className="kbd">?</span></button>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={`Confirm ${confirm === 'long' ? 'long' : 'short'} · ${base}/USDT`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm === 'long' ? 'up' : 'down'} loading={busy} onClick={() => confirm && doSubmit(confirm)} data-autofocus>Confirm</Button></>}
      >
        <div className="space-y-2 p-5 text-sm">
          <Row k="Type" v={<span className="capitalize">{type}</span>} />
          <Row k="Leverage" v={`${leverage}×`} />
          <Row k="Margin" v={fmtUsd(floorCents(m))} />
          <Row k="Position size" v={fmtUsd(size)} />
          <Row k={type === 'market' ? 'Est. entry' : 'Trigger'} v={entry ? fmtPrice(entry, dp) : '—'} />
          <Row k="Liquidation" v={liq ? fmtPrice(liq, dp) : '—'} tone="down" />
          {Number.isFinite(tpN) && <Row k="Take-profit" v={fmtPrice(tpN)} tone="up" />}
          {Number.isFinite(slN) && <Row k="Stop-loss" v={fmtPrice(slN)} tone="warn" />}
        </div>
      </Modal>
    </section>
  );
}

export const OrderTicket = memo(OrderTicketInner);
