'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Share2, SlidersHorizontal, X } from 'lucide-react';
import { errMsg, get, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, fmtNum, fmtPrice, fmtSigned, fmtUsd, pnlClass, qtyDecimals, shortId, timeHMS } from '@/lib/format';
import type { HistoryOrder, HistoryResponse, Position, Side } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Badge, Tabs } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { Flash } from './Flash';
import { useTerminalData } from './data';
import { beep } from './sound';
import { useTerminal, type PendingOrder } from './store';

type Tab = 'positions' | 'pending' | 'history';

export const sym = (s: string) => s.replace('USDT', '/USDT');
export const SideTag = ({ side }: { side: Side }) => (
  <span className={cn('rounded px-1 py-px text-2xs font-semibold uppercase', side === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>{side}</span>
);
/** MetaTrader wording: long = buy, short = sell. */
export const TypeTag = ({ side }: { side: Side }) => (
  <span className={cn('text-xs font-semibold uppercase', side === 'long' ? 'text-up' : 'text-down')}>{side === 'long' ? 'buy' : 'sell'}</span>
);

/* ── TP / SL editor ─────────────────────────────────────────────────────── */
export function ProtectionModal({ pos, onClose, onDone }: { pos: Position | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (pos && pos.id !== lastId) { setLastId(pos.id); setTp(pos.take_profit ? String(pos.take_profit) : ''); setSl(pos.stop_loss ? String(pos.stop_loss) : ''); }

  const tpN = tp === '' ? null : Number(tp), slN = sl === '' ? null : Number(sl);
  let tpErr: string | null = null, slErr: string | null = null;
  if (pos) {
    if (tpN != null && (!Number.isFinite(tpN) || tpN <= 0)) tpErr = 'Enter a valid price.';
    else if (tpN != null && (pos.side === 'long' ? tpN <= pos.mark_price : tpN >= pos.mark_price)) tpErr = pos.side === 'long' ? 'Must be above the current mark.' : 'Must be below the current mark.';
    if (slN != null && (!Number.isFinite(slN) || slN <= 0)) slErr = 'Enter a valid price.';
    else if (slN != null && (pos.side === 'long' ? slN >= pos.mark_price : slN <= pos.mark_price)) slErr = pos.side === 'long' ? 'Must be below the current mark.' : 'Must be above the current mark.';
    else if (slN != null && (pos.side === 'long' ? slN <= pos.liquidation_price : slN >= pos.liquidation_price)) slErr = 'Beyond the liquidation price.';
  }

  const save = async () => {
    if (!pos || tpErr || slErr) return;
    setBusy(true);
    try {
      await post('/trade/protection', { order_id: pos.id, take_profit: tpN, stop_loss: slN });
      toast.success('Protection updated', `${sym(pos.symbol)} · TP ${tpN ? fmtPrice(tpN) : '—'} · SL ${slN ? fmtPrice(slN) : '—'}`);
      onDone();
      onClose();
    } catch (e) { toast.error('Could not update TP/SL', errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!pos} onClose={onClose} size="sm" title={pos ? `TP / SL · ${sym(pos.symbol)}` : ''}
      description={pos ? `${pos.side.toUpperCase()} ${pos.leverage}× · entry ${fmtPrice(pos.entry_price)} · mark ${fmtPrice(pos.mark_price)} · liq ${fmtPrice(pos.liquidation_price)}` : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!!tpErr || !!slErr} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3 p-5">
        {([['Take-profit', tp, setTp, tpErr, 'text-up'], ['Stop-loss', sl, setSl, slErr, 'text-warn']] as const).map(([label, val, setter, err, color]) => (
          <div key={label} className="space-y-1">
            <label className={cn('text-xs', color)} htmlFor={`pm-${label}`}>{label}</label>
            <input id={`pm-${label}`} inputMode="decimal" value={val} placeholder="Not set" aria-invalid={!!err}
              onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) setter(v); }}
              className={cn('num h-9 w-full rounded-md border bg-panel2 px-2.5 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25', err ? 'border-down' : 'border-line')} />
            {err && <p role="alert" className="text-2xs text-down">{err}</p>}
          </div>
        ))}
        <p className="col-span-2 text-2xs text-subtle">Leave a field empty to clear it. Levels are enforced by the risk engine on every positions sweep.</p>
      </div>
    </Modal>
  );
}

/* ── Open positions ─────────────────────────────────────────────────────── */
function PositionsTable({ onEdit }: { onEdit: (p: Position) => void }) {
  const toast = useToast();
  const { positions, loading, error, refresh } = useTerminalData();
  const setSymbol = useTerminal((s) => s.setSymbol);
  const soundOn = useTerminal((s) => s.soundOn);
  const current = useTerminal((s) => s.symbol);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [closeAll, setCloseAll] = useState(false);

  const close = useCallback(async (p: Position, percent = 100) => {
    setBusy(p.id); setMenu(null);
    try {
      if (percent >= 100) {
        const r = await post<{ order: { pnl: number; close_price: number } }>('/trade/close', { order_id: p.id });
        toast.success(`${sym(p.symbol)} closed`, `${fmtSigned(r.order.pnl)} USDT at ${fmtPrice(r.order.close_price)}`);
        if (soundOn) beep(r.order.pnl >= 0 ? 'up' : 'down');
      } else {
        const r = await post<{ closed: { pnl: number; close_price: number } }>('/trade/partial-close', { order_id: p.id, percent });
        toast.success(`${percent}% of ${sym(p.symbol)} closed`, `${fmtSigned(r.closed.pnl)} USDT at ${fmtPrice(r.closed.close_price)}`);
      }
      await refresh();
    } catch (e) { toast.error('Close failed', errMsg(e)); } finally { setBusy(null); }
  }, [toast, refresh, soundOn]);

  const flatten = useCallback(async (list: Position[]) => {
    setCloseAll(true);
    const res = await Promise.allSettled(list.map((p) => post('/trade/close', { order_id: p.id })));
    const failed = res.filter((r) => r.status === 'rejected').length;
    if (failed) toast.warn('Some positions did not close', `${failed} of ${list.length} failed — try again.`);
    else toast.success('All positions closed');
    await refresh();
    setCloseAll(false);
  }, [toast, refresh]);

  const share = (p: Position) => useTerminal.getState().set({ tradeCard: { id: p.id, label: `${sym(p.symbol)} ${p.side === 'long' ? 'Buy' : 'Sell'}`, live: true, data: { symbol: p.symbol, side: p.side, leverage: p.leverage, entry: p.entry_price, exit: p.mark_price, pnl: p.unrealized_pnl, margin: p.margin, size: p.position_size, opened: p.created_at, closed: null } } });

  const cols: Column<Position>[] = useMemo(() => [
    { key: 'symbol', header: 'Symbol', sortValue: (p) => p.symbol, searchText: (p) => `${p.symbol} ${p.side} ${p.id}`,
      cell: (p) => <button onClick={() => setSymbol(p.symbol)} className={cn('text-left font-medium hover:text-accent', p.symbol === current && 'text-accent')}>{sym(p.symbol)}</button> },
    { key: 'ticket', header: 'Ticket', hideBelow: 'xl', sortValue: (p) => p.id, cell: (p) => <span className="num font-mono text-xs text-muted">#{shortId(p.id)}</span> },
    { key: 'time', header: 'Time', hideBelow: 'xl', sortValue: (p) => Date.parse(p.created_at), cell: (p) => <span className="num text-xs text-muted">{dateTime(p.created_at)}</span> },
    { key: 'type', header: 'Type', sortValue: (p) => p.side, cell: (p) => <TypeTag side={p.side} /> },
    { key: 'size', header: 'Volume', align: 'right', sortValue: (p) => p.quantity, cell: (p) => <span className="num font-mono">{fmtNum(p.quantity, qtyDecimals(p.entry_price) + 1)}</span> },
    { key: 'lev', header: 'Lev.', align: 'right', hideBelow: 'xl', sortValue: (p) => p.leverage, cell: (p) => <span className="num font-mono text-muted">{p.leverage}×</span> },
    { key: 'entry', header: 'Price', align: 'right', sortValue: (p) => p.entry_price, cell: (p) => <span className="num font-mono">{fmtPrice(p.entry_price)}</span> },
    { key: 'sl', header: 'S / L', align: 'right', sortValue: (p) => p.stop_loss ?? 0, cell: (p) => (
      <button onClick={() => onEdit(p)} className="num font-mono text-xs text-warn hover:underline" aria-label={`Edit stop-loss for ${sym(p.symbol)}`}>{p.stop_loss ? fmtPrice(p.stop_loss) : <span className="text-subtle">—</span>}</button>) },
    { key: 'tp', header: 'T / P', align: 'right', sortValue: (p) => p.take_profit ?? 0, cell: (p) => (
      <button onClick={() => onEdit(p)} className="num font-mono text-xs text-up hover:underline" aria-label={`Edit take-profit for ${sym(p.symbol)}`}>{p.take_profit ? fmtPrice(p.take_profit) : <span className="text-subtle">—</span>}</button>) },
    { key: 'mark', header: 'Current', align: 'right', sortValue: (p) => p.mark_price, cell: (p) => <Flash value={p.mark_price}><span className="num font-mono">{fmtPrice(p.mark_price)}</span></Flash> },
    { key: 'liq', header: 'Liq.', align: 'right', hideBelow: '2xl', sortValue: (p) => p.liquidation_price, cell: (p) => <span className="num font-mono text-warn">{fmtPrice(p.liquidation_price)}</span> },
    { key: 'pnl', header: 'Profit', align: 'right', sortValue: (p) => p.unrealized_pnl, cell: (p) => (
      <span className={cn('num font-mono font-semibold', pnlClass(p.unrealized_pnl))}>{fmtSigned(p.unrealized_pnl)}<span className="ml-1 text-2xs font-normal opacity-80">({fmtSigned(p.unrealized_pnl_pct, 1)}%)</span></span>) },
    { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', cell: (p) => (
      <div className="relative flex justify-end gap-1">
        <button onClick={() => onEdit(p)} className="grid h-6 w-6 place-items-center rounded text-subtle hover:bg-fg/[0.08] hover:text-fg" aria-label="Edit TP/SL" title="Modify S/L · T/P"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
        <button onClick={() => share(p)} className="grid h-6 w-6 place-items-center rounded text-subtle hover:bg-fg/[0.08] hover:text-fg" aria-label="Share" title="Share"><Share2 className="h-3.5 w-3.5" /></button>
        <div className="relative">
          <button onClick={() => setMenu(menu === p.id ? null : p.id)} disabled={busy === p.id} aria-haspopup="menu" aria-expanded={menu === p.id} className="h-6 rounded border border-line px-1.5 text-2xs font-medium text-muted hover:border-subtle hover:text-fg disabled:opacity-40" title="Partial close">%</button>
          {menu === p.id && (
            <div role="menu" className="absolute right-0 top-7 z-20 w-24 overflow-hidden rounded-md border border-line bg-panel shadow-xl">
              {[25, 50, 75].map((n) => <button key={n} role="menuitem" onClick={() => close(p, n)} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-fg/[0.06]">Close {n}%</button>)}
            </div>)}
        </div>
        <Button size="xs" variant="danger" loading={busy === p.id} onClick={() => close(p)}>Close</Button>
      </div>) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [current, menu, busy, onEdit, setSymbol, close]);

  return (
    <DataTable<Position>
      compact bare dense
      columns={cols} rows={positions} rowKey={(p) => p.id}
      loading={loading && positions.length === 0} error={error && positions.length === 0 ? error : undefined} onRetry={() => void refresh()}
      pageSize={10} pageSizes={[10, 25, 50]} searchPlaceholder="Search by symbol or ticket"
      initialSort={{ key: 'pnl', dir: 'asc' }}
      toolbar={positions.length > 1 ? <Button size="xs" variant="danger" loading={closeAll} onClick={() => flatten(positions)}>Close all ({positions.length})</Button> : undefined}
      empty={{ title: 'No open positions', description: 'Orders you open appear here and update every two seconds.' }}
    />
  );
}

/* ── Pending ───────────────────────────────────────────────────────────── */
function PendingTable() {
  const { accountId } = useTerminalData();
  const all = useTerminal((s) => s.pending);
  const remove = useTerminal((s) => s.removePending);
  const rows = useMemo(() => all.filter((o) => o.accountId === accountId), [all, accountId]);
  const prices = useTerminal((s) => s.prices);

  const cols: Column<PendingOrder>[] = [
    { key: 'symbol', header: 'Symbol', sortValue: (o) => o.symbol, searchText: (o) => `${o.symbol} ${o.side} ${o.kind}`, cell: (o) => <span className="flex items-center gap-1.5 font-medium">{sym(o.symbol)}<SideTag side={o.side} /></span> },
    { key: 'kind', header: 'Type', sortValue: (o) => o.kind, cell: (o) => <Badge tone={o.status === 'failed' ? 'down' : o.status === 'filling' ? 'warn' : 'info'}>{o.status === 'working' ? o.kind : o.status}</Badge> },
    { key: 'trigger', header: 'Trigger', align: 'right', sortValue: (o) => o.trigger, cell: (o) => <span className="num font-mono">{fmtPrice(o.trigger)}</span> },
    { key: 'now', header: 'Market', align: 'right', hideBelow: 'sm', cell: (o) => { const p = prices[o.symbol]; return <span className="num font-mono text-muted">{p ? fmtPrice(o.side === 'long' ? p.ask : p.bid) : '—'}</span>; } },
    { key: 'lev', header: 'Lev.', align: 'right', hideBelow: 'md', sortValue: (o) => o.leverage, cell: (o) => <span className="num font-mono">{o.leverage}×</span> },
    { key: 'margin', header: 'Margin', align: 'right', sortValue: (o) => o.margin, cell: (o) => <span className="num font-mono">{fmtNum(o.margin)}</span> },
    { key: 'tpsl', header: 'TP / SL', align: 'right', hideBelow: 'lg', cell: (o) => <span className="num font-mono text-xs"><span className="text-up">{o.tp ? fmtPrice(o.tp) : '—'}</span> / <span className="text-warn">{o.sl ? fmtPrice(o.sl) : '—'}</span></span> },
    { key: 'at', header: 'Placed', hideBelow: 'md', sortValue: (o) => o.createdAt, cell: (o) => <span className="num text-xs text-muted">{timeHMS(o.createdAt)}</span> },
    { key: 'x', header: <span className="sr-only">Cancel</span>, align: 'right', cell: (o) => (
      <div className="flex items-center justify-end gap-2">
        {o.error && <span className="max-w-[16ch] truncate text-2xs text-down" title={o.error}>{o.error}</span>}
        <Button size="xs" variant="ghost" icon={<X className="h-3 w-3" />} onClick={() => remove(o.id)} aria-label="Cancel order" disabled={o.status === 'filling'}>Cancel</Button>
      </div>) },
  ];

  return (
    <DataTable<PendingOrder> compact bare dense columns={cols} rows={rows} rowKey={(o) => o.id} pageSize={10} searchPlaceholder="Search orders"
      footerNote="Limit and stop orders live in this browser and fire as market orders only while the terminal is open."
      empty={{ title: 'No pending orders', description: 'Place a Limit or Stop order from the ticket to see it here.' }} />
  );
}

/* ── History (server-paginated) ─────────────────────────────────────────── */
export const REASON: Record<string, string> = { manual: 'Manual', liquidation: 'Liquidated', stop_loss: 'Stop-loss', take_profit: 'Take-profit', DAILY_DRAWDOWN: 'Daily DD', MAX_DRAWDOWN: 'Max DD', partial: 'Partial' };

function HistoryTable({ onStats }: { onStats?: (st: HistoryResponse['stats'] | null) => void }) {
  const { accountId } = useTerminalData();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [q, setQ] = useState('');
  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    ['terminal-history', accountId, page, size],
    () => get<HistoryResponse>('/trade/history', { account_id: accountId, limit: size, offset: page * size, status: 'closed' }),
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  useEffect(() => { onStats?.(data?.stats ?? null); }, [data, onStats]);

  const cols: Column<HistoryOrder>[] = [
    { key: 'symbol', header: 'Symbol', sortValue: (o) => o.symbol, searchText: (o) => `${o.symbol} ${o.side} ${o.id} ${o.close_reason ?? ''}`, cell: (o) => <span className="font-medium">{sym(o.symbol)}</span> },
    { key: 'ticket', header: 'Ticket', hideBelow: 'xl', cell: (o) => <span className="num font-mono text-xs text-muted">#{shortId(o.id)}</span> },
    { key: 'opened', header: 'Open time', hideBelow: 'xl', sortValue: (o) => Date.parse(o.created_at), cell: (o) => <span className="num text-xs text-muted">{dateTime(o.created_at)}</span> },
    { key: 'type', header: 'Type', sortValue: (o) => o.side, cell: (o) => <TypeTag side={o.side} /> },
    { key: 'size', header: 'Volume', align: 'right', hideBelow: 'md', sortValue: (o) => o.position_size, cell: (o) => <span className="num font-mono">{o.entry_price ? fmtNum(o.position_size / o.entry_price, qtyDecimals(o.entry_price) + 1) : '—'}</span> },
    { key: 'entry', header: 'Price', align: 'right', hideBelow: 'sm', sortValue: (o) => o.entry_price, cell: (o) => <span className="num font-mono">{fmtPrice(o.entry_price)}</span> },
    { key: 'exit', header: 'Close price', align: 'right', hideBelow: 'sm', sortValue: (o) => o.close_price, cell: (o) => <span className="num font-mono">{fmtPrice(o.close_price)}</span> },
    { key: 'closed', header: 'Close time', align: 'right', sortValue: (o) => (o.closed_at ? Date.parse(o.closed_at) : 0), cell: (o) => <span className="num text-xs text-muted">{dateTime(o.closed_at)}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'lg', sortValue: (o) => o.close_reason, cell: (o) => <span className="text-xs text-muted">{o.close_reason ? REASON[o.close_reason] ?? o.close_reason : '—'}</span> },
    { key: 'pnl', header: 'Profit', align: 'right', sortValue: (o) => o.pnl, cell: (o) => <span className={cn('num font-mono font-semibold', pnlClass(o.pnl))}>{fmtSigned(o.pnl)}</span> },
    { key: 'share', header: <span className="sr-only">Share</span>, align: 'right', cell: (o) => <button onClick={() => useTerminal.getState().set({ tradeCard: { id: o.id, label: `${sym(o.symbol)} ${o.side === 'long' ? 'Buy' : 'Sell'}`, live: false, data: { symbol: o.symbol, side: o.side, leverage: o.leverage, entry: o.entry_price, exit: o.close_price, pnl: o.pnl, margin: o.margin, size: o.position_size, opened: o.created_at, closed: o.closed_at, reason: o.close_reason } } })} className="inline-grid h-6 w-6 place-items-center rounded text-subtle hover:bg-fg/[0.08] hover:text-fg" aria-label={`Trade card for ${sym(o.symbol)}`} title="Trade card"><Share2 className="h-3.5 w-3.5" /></button> },
  ];

  return (
    <DataTable<HistoryOrder>
      compact bare dense columns={cols} rows={data?.orders} rowKey={(o) => o.id}
      loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
      searchPlaceholder="Search this page" pageSizes={[10, 25, 50, 100]} initialSort={{ key: 'closed', dir: 'desc' }}
      server={{ total: data?.total ?? 0, page, pageSize: size, onPageChange: setPage, onPageSizeChange: (n) => { setSize(n); setPage(0); }, query: q, onQueryChange: setQ, clientSearch: true }}
      empty={{ title: 'No closed trades yet', description: 'Settled trades, partial closes and liquidations appear here.' }}
    />
  );
}

/* ── MetaTrader-style account line ─────────────────────────────────────── */
function Kv({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  return <span className="whitespace-nowrap"><span className="text-subtle">{k}: </span><span className={cn('num font-mono', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</span></span>;
}

function AccountLine({ tab, stats }: { tab: Tab; stats: HistoryResponse['stats'] | null }) {
  const { account, metrics, positions } = useTerminalData();
  if (tab === 'history') {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-line bg-panel2/60 px-3 py-1.5 text-xs">
        {stats ? (<>
          <Kv k="Trades" v={stats.trades} />
          <Kv k="Win rate" v={`${fmtNum(stats.win_rate, 1)}%`} />
          <Kv k="Wins / Losses" v={`${stats.wins} / ${stats.losses}`} />
          <span className="ml-auto"><Kv k="Net profit" v={fmtSigned(stats.net_pnl)} tone={stats.net_pnl > 0 ? 'up' : stats.net_pnl < 0 ? 'down' : undefined} /></span>
        </>) : <span className="text-subtle">Loading statistics…</span>}
      </div>
    );
  }
  if (!account || !metrics) return null;
  const ml = metrics.used_margin > 0 ? (metrics.equity / metrics.used_margin) * 100 : null;
  const total = positions.reduce((a, p) => a + p.unrealized_pnl, 0);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-line bg-panel2/60 px-3 py-1.5 text-xs">
      <Kv k="Balance" v={fmtUsd(account.balance)} />
      <Kv k="Equity" v={fmtUsd(metrics.equity)} />
      <Kv k="Margin" v={fmtUsd(metrics.used_margin)} />
      <Kv k="Free margin" v={fmtUsd(metrics.free_margin)} />
      <Kv k="Margin level" v={ml == null ? '—' : `${fmtNum(ml, 2)}%`} tone={ml != null && ml < 120 ? 'down' : ml != null && ml < 200 ? 'warn' : undefined} />
      <span className="ml-auto"><Kv k="Profit" v={fmtSigned(total)} tone={total > 0 ? 'up' : total < 0 ? 'down' : undefined} /></span>
    </div>
  );
}

/* ── Container ──────────────────────────────────────────────────────────── */
function PositionsPanelInner({ className }: { className?: string }) {
  const { positions, refresh, accountId } = useTerminalData();
  const pendingCount = useTerminal((s) => s.pending.filter((o) => o.accountId === accountId).length);
  const [tab, setTab] = useState<Tab>('positions');
  const [editing, setEditing] = useState<Position | null>(null);
  const [stats, setStats] = useState<HistoryResponse['stats'] | null>(null);

  return (
    <section className={cn('flex min-h-0 flex-col bg-panel', className)} aria-label="Terminal: trades, pending orders and history">
      <Tabs<Tab> className="shrink-0 px-3 pt-1.5" value={tab} onChange={setTab}
        tabs={[{ value: 'positions', label: 'Trade', count: positions.length }, { value: 'pending', label: 'Pending orders', count: pendingCount }, { value: 'history', label: 'History' }]} />
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'positions' && <PositionsTable onEdit={setEditing} />}
        {tab === 'pending' && <PendingTable />}
        {tab === 'history' && <HistoryTable onStats={setStats} />}
      </div>
      <AccountLine tab={tab} stats={stats} />
      <ProtectionModal pos={editing} onClose={() => setEditing(null)} onDone={() => void refresh()} />
    </section>
  );
}

export const PositionsPanel = memo(PositionsPanelInner);
