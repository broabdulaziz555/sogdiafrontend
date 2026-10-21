'use client';

import { useMemo, useState } from 'react';
import { Award, Gift, Pencil, Snowflake, Trash2 } from 'lucide-react';
import { del, errMsg, post } from '@/lib/api';
import { dateTime, fmtNum, fmtUsd } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import type { Account } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Badge, CopyButton, Field, Input, Segmented, Select, StatusBadge } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { KV, ReasonDialog, Section, XTag, useIsX } from './AdminKit';
import { GiftModal } from './GiftModal';

const STATUS_FILTERS = ['', 'active', 'passed', 'frozen', 'breached', 'failed', 'closed'].map((v) => ({ value: v, label: v ? v[0].toUpperCase() + v.slice(1) : 'All' }));
interface Res { accounts: Account[]; total: number }

/* ── X-Department account surgery ─────────────────────────────────────────── */
function AdjustModal({ account, onClose, onDone }: { account: Account | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const flag = (k: string, label: string, hint?: string) => (
    <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!flags[k]} onChange={(e) => setFlags((s) => ({ ...s, [k]: e.target.checked }))} className="mt-1 accent-[rgb(var(--accent))]" /><span>{label}{hint && <span className="block text-2xs text-subtle">{hint}</span>}</span></label>
  );

  const body = useMemo(() => {
    const b: Record<string, unknown> = {};
    const n = (k: string, out: string) => { const v = f[k]?.trim(); if (v) b[out] = Number(v); };
    n('set_balance', 'set_balance'); n('balance_delta', 'balance_delta'); n('set_size', 'set_size');
    if (status) b.set_status = status;
    for (const k of ['reset_daily_start', 'reset_drawdown', 'close_positions', 'clear_breach']) if (flags[k]) b[k] = true;
    const rules: Record<string, number | null> = {};
    for (const k of ['max_leverage', 'daily_dd_pct', 'max_dd_pct', 'payout_split_pct', 'payout_cycle_days', 'profit_target_pct']) { const v = f[`r_${k}`]?.trim(); if (v) rules[k] = v.toLowerCase() === 'none' ? null : Number(v); }
    if (Object.keys(rules).length) b.rules = rules;
    return b;
  }, [f, flags, status]);

  const rulesObj = (body.rules ?? {}) as Record<string, number | null>;
  const invalid = Object.entries(body).some(([k, v]) => k !== 'rules' && typeof v === 'number' && !Number.isFinite(v)) || Object.values(rulesObj).some((v) => typeof v === 'number' && !Number.isFinite(v));
  const empty = Object.keys(body).length === 0;
  const ok = !empty && !invalid && reason.trim().length >= 3;

  const submit = async () => {
    if (!account) return;
    setBusy(true); setErr(null);
    try {
      const r = await post<{ closed_orders?: number }>(`/xdepartment/accounts/${account.id}/adjust`, { ...body, reason: reason.trim() });
      toast.success('Account adjusted', r.closed_orders ? `${r.closed_orders} position(s) closed` : undefined);
      onDone(); onClose(); setF({}); setFlags({}); setStatus(''); setReason('');
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!account} onClose={() => !busy && onClose()} size="lg" title="Adjust account" description={account ? `${account.id} · balance ${fmtUsd(account.balance)} · size ${fmtUsd(account.size)}` : undefined}
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!ok} onClick={submit}>Apply changes</Button></>}>
      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Set balance" htmlFor="a-sb"><Input id="a-sb" inputMode="decimal" value={f.set_balance ?? ''} onChange={set('set_balance')} placeholder="12000" /></Field>
          <Field label="Balance ± delta" htmlFor="a-bd"><Input id="a-bd" inputMode="decimal" value={f.balance_delta ?? ''} onChange={set('balance_delta')} placeholder="-500" /></Field>
          <Field label="Set size" htmlFor="a-ss" hint="Re-bases the max-DD floor"><Input id="a-ss" inputMode="decimal" value={f.set_size ?? ''} onChange={set('set_size')} placeholder="50000" /></Field>
        </div>
        <Field label="Force status" htmlFor="a-st"><Select id="a-st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Leave unchanged</option>{['active', 'passed', 'failed', 'frozen', 'breached', 'closed'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {flag('close_positions', 'Close open positions first', 'Flattens at market before other changes')}
          {flag('reset_daily_start', 'Reset daily start', 'Daily DD floor moves to current balance')}
          {flag('reset_drawdown', 'Reset drawdown', 'Clears breach, resets daily floor, status → active')}
          {flag('clear_breach', 'Clear breach flag')}
        </div>
        <details className="rounded-md border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted">Rule overrides <span className="text-subtle">(blank = keep; “none” clears a profit target)</span></summary>
          <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-3">
            {([['max_leverage', 'Max leverage'], ['daily_dd_pct', 'Daily DD %'], ['max_dd_pct', 'Max DD %'], ['payout_split_pct', 'Payout split %'], ['payout_cycle_days', 'Cycle (days)'], ['profit_target_pct', 'Profit target %']] as const).map(([k, l]) => <Field key={k} label={l} htmlFor={`a-r-${k}`}><Input id={`a-r-${k}`} value={f[`r_${k}`] ?? ''} onChange={set(`r_${k}`)} /></Field>)}
          </div>
        </details>
        <Field label="Reason" htmlFor="a-reason" hint="Recorded in the audit log with before/after values."><Input id="a-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Compensating for a feed outage" /></Field>
        {invalid && <p className="text-xs text-down">One of the numeric fields isn’t a number.</p>}
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

function IssueCertModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('payout');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = Number(amount);
  const ok = !!name.trim() && Number.isFinite(amt) && amt >= 0 && amount !== '';
  const submit = async () => {
    if (!account) return;
    setBusy(true); setErr(null);
    try {
      await post('/admin/certificates', { user_id: account.user_id, account_id: account.id, type, amount: amt, display_name: name.trim() });
      toast.success('Certificate issued'); void revalidatePath('/certificates'); onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!account} onClose={() => !busy && onClose()} size="sm" title="Issue certificate" description="Manual certificates are flagged as such."
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!ok} onClick={submit}>Issue</Button></>}>
      <div className="space-y-3 p-5">
        <Field label="Type" htmlFor="c-type"><Select id="c-type" value={type} onChange={(e) => setType(e.target.value)}><option value="payout">Payout</option><option value="eval_pass">Evaluation passed</option></Select></Field>
        <Field label="Amount (USD)" htmlFor="c-amt"><Input id="c-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder="2500" /></Field>
        <Field label="Name on certificate" htmlFor="c-name"><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ali Karimov" /></Field>
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

function DeleteDialog({ account, onClose, onDone }: { account: Account | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const code = account?.id.slice(0, 8) ?? '';
  const submit = async () => {
    if (!account) return;
    setBusy(true); setErr(null);
    try { await del(`/xdepartment/accounts/${account.id}`); toast.success('Account deleted'); onDone(); onClose(); setTyped(''); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!account} onClose={() => !busy && onClose()} size="sm" title="Delete account permanently?" description="Cascades to every order on the account. This cannot be undone — prefer “Close” for real traders."
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="down" loading={busy} disabled={typed !== code} onClick={submit}>Delete forever</Button></>}>
      <div className="space-y-3 p-5">
        <Field label={<>Type <code className="rounded bg-panel2 px-1 font-mono text-fg">{code}</code> to confirm</>} htmlFor="d-confirm"><Input id="d-confirm" value={typed} onChange={(e) => setTyped(e.target.value.trim())} autoComplete="off" spellCheck={false} /></Field>
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

/* ── Drawer ───────────────────────────────────────────────────────────────── */
type Dlg = null | 'freeze' | 'breach' | 'close' | 'adjust' | 'delete' | 'cert';

function AccountDrawer({ account, onClose, onChanged }: { account: Account | null; onClose: () => void; onChanged: () => void }) {
  const isX = useIsX();
  const toast = useToast();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [closePos, setClosePos] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const a = account;

  const status = async (action: string, reason?: string, extra?: object) => {
    const r = await post<{ closed_orders?: number }>(`/admin/accounts/${a.id}/status`, { action, ...(reason ? { reason } : {}), ...extra });
    toast.success(`Account ${action === 'unfreeze' ? 'unfrozen' : action === 'freeze' ? 'frozen' : action === 'breach' ? 'breached' : 'closed'}`, r.closed_orders ? `${r.closed_orders} position(s) closed` : undefined);
    onChanged();
  };

  return (
    <>
      <Drawer open={!!account} onClose={onClose} width="max-w-lg"
        title={`${a.type === 'instant' ? 'Instant' : 'One-Step'} ${fmtUsd(a.size).replace(/\.00$/, '')}`}
        subtitle={<span className="flex items-center gap-2"><StatusBadge status={a.status} />{a.is_gifted && <Badge tone="info">gifted</Badge>}<span className="truncate">{a.user_email}</span></span>}>
        <div className="space-y-5 p-5">
          <dl className="divide-y divide-line rounded-xl border border-line bg-panel px-4">
            <KV k="Account ID" v={<span className="inline-flex items-center gap-1.5">{a.id.slice(0, 8)}…<CopyButton value={a.id} /></span>} mono />
            <KV k="Plan" v={a.plan_key} mono />
            <KV k="Balance" v={fmtUsd(a.balance)} mono />
            <KV k="Equity" v={fmtUsd(a.equity)} mono />
            <KV k="Daily start balance" v={fmtUsd(a.daily_start_balance)} mono />
            <KV k="Profit target" v={a.profit_target_pct != null ? `${a.profit_target_pct}%` : 'None'} />
            <KV k="Drawdown (daily / max)" v={`${a.daily_dd_pct}% / ${a.max_dd_pct}%`} />
            <KV k="Max leverage" v={`${a.max_leverage}×`} />
            <KV k="Payout split / cycle" v={`${a.payout_split_pct}% · ${a.payout_cycle_days} d`} />
            <KV k="Next payout" v={a.next_payout_at ? dateTime(a.next_payout_at) : '—'} />
            <KV k="Created" v={dateTime(a.created_at)} />
          </dl>

          <Section title="Operations">
            <div className="flex flex-wrap gap-2 p-4">
              {a.status === 'frozen'
                ? <Button size="sm" variant="up" loading={busy} onClick={async () => { setBusy(true); try { await status('unfreeze'); } catch (e) { toast.error('Failed', errMsg(e)); } finally { setBusy(false); } }}>Unfreeze</Button>
                : <Button size="sm" variant="secondary" icon={<Snowflake className="h-3.5 w-3.5" />} disabled={!['active', 'passed'].includes(a.status)} onClick={() => setDlg('freeze')}>Freeze</Button>}
              <Button size="sm" variant="danger" disabled={['breached', 'closed', 'failed'].includes(a.status)} onClick={() => setDlg('breach')}>Breach</Button>
              <Button size="sm" variant="secondary" disabled={a.status === 'closed'} onClick={() => setDlg('close')}>Close</Button>
              <Button size="sm" variant="secondary" icon={<Award className="h-3.5 w-3.5" />} onClick={() => setDlg('cert')}>Issue certificate</Button>
              <a href={`/trades?account=${a.id}`} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm font-medium text-fg hover:border-subtle/70">View trades</a>
            </div>
          </Section>

          <Section title="X-Department" actions={<XTag />}>
            <div className="flex flex-wrap gap-2 p-4">
              {isX ? (<>
                <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDlg('adjust')}>Adjust…</Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDlg('delete')}>Delete…</Button>
              </>) : <p className="text-xs text-subtle">Balance surgery, rule overrides and deletion are limited to the X-Department tier.</p>}
            </div>
          </Section>
        </div>
      </Drawer>

      <ReasonDialog open={dlg === 'freeze'} onClose={() => setDlg(null)} title="Freeze account" description="Trading is blocked until it is unfrozen." confirmLabel="Freeze" onConfirm={(r) => status('freeze', r)} />
      <ReasonDialog open={dlg === 'close'} onClose={() => setDlg(null)} title="Close account" confirmLabel="Close account" tone="down" onConfirm={(r) => status('close', r)} />
      <ReasonDialog open={dlg === 'breach'} onClose={() => setDlg(null)} title="Breach account" description="For illegal or abusive trading. The account is terminated." confirmLabel="Breach" tone="down" placeholder="e.g. Latency arbitrage detected" onConfirm={(r) => status('breach', r, { close_positions: closePos })}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={closePos} onChange={(e) => setClosePos(e.target.checked)} className="accent-[rgb(var(--accent))]" />Close open positions at market</label>
      </ReasonDialog>
      <IssueCertModal account={dlg === 'cert' ? a : null} onClose={() => setDlg(null)} />
      <AdjustModal account={dlg === 'adjust' ? a : null} onClose={() => setDlg(null)} onDone={onChanged} />
      <DeleteDialog account={dlg === 'delete' ? a : null} onClose={() => setDlg(null)} onDone={() => { onChanged(); onClose(); }} />
    </>
  );
}

export function AccountsPanel() {
  const isX = useIsX();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [sel, setSel] = useState<Account | null>(null);
  const [gift, setGift] = useState(false);
  const { data, error, isLoading, mutate } = useApi<Res>('/admin/accounts', { status: st || undefined, limit: size, offset: page * size });

  const cols: Column<Account>[] = useMemo(() => [
    { key: 'user', header: 'Trader', sortValue: (a) => a.user_email, searchText: (a) => `${a.user_email ?? ''} ${a.id} ${a.plan_key}`, cell: (a) => <span className="block min-w-0"><span className="block truncate font-medium">{a.user_email ?? '—'}</span><span className="block font-mono text-2xs text-subtle">{a.id.slice(0, 8)}</span></span> },
    { key: 'plan', header: 'Plan', sortValue: (a) => a.size, hideBelow: 'sm', cell: (a) => <span className="whitespace-nowrap">{a.type === 'instant' ? 'Instant' : 'One-Step'} <span className="num font-mono text-muted">{fmtUsd(a.size).replace(/\.00$/, '')}</span>{a.is_gifted && <Badge tone="info" className="ml-1.5">gift</Badge>}</span> },
    { key: 'status', header: 'Status', sortValue: (a) => a.status, cell: (a) => <StatusBadge status={a.status} /> },
    { key: 'equity', header: 'Equity', align: 'right', sortValue: (a) => a.equity, cell: (a) => <span className="num font-mono">{fmtUsd(a.equity)}</span> },
    { key: 'pnl', header: 'vs. size', align: 'right', hideBelow: 'md', sortValue: (a) => a.equity - a.size, cell: (a) => { const d = a.equity - a.size; return <span className={`num font-mono ${d > 0 ? 'text-up' : d < 0 ? 'text-down' : 'text-muted'}`}>{d > 0 ? '+' : d < 0 ? '−' : ''}{fmtNum(Math.abs(d))}</span>; } },
    { key: 'created', header: 'Created', align: 'right', hideBelow: 'lg', sortValue: (a) => Date.parse(a.created_at), cell: (a) => <span className="num text-xs text-muted">{dateTime(a.created_at)}</span> },
  ], []);

  return (
    <>
      <PageHead title="Accounts" subtitle="Freeze, breach, close or adjust trading accounts. Search filters the loaded page."
        actions={isX ? <Button variant="primary" size="sm" icon={<Gift className="h-4 w-4" />} onClick={() => setGift(true)}>Gift accounts</Button> : undefined} />
      <DataTable<Account>
        columns={cols} rows={data?.accounts} rowKey={(a) => a.id} loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
        onRowClick={setSel} activeRowKey={sel?.id} searchPlaceholder="Search this page" pageSizes={[25, 50, 100]} initialSort={{ key: 'created', dir: 'desc' }}
        server={{ total: data?.total ?? 0, page, pageSize: size, onPageChange: setPage, onPageSizeChange: (n) => { setSize(n); setPage(0); }, query: q, onQueryChange: setQ, clientSearch: true }}
        toolbar={<Segmented value={st} onChange={(v) => { setSt(v); setPage(0); }} options={STATUS_FILTERS} size="sm" ariaLabel="Status filter" />}
        empty={{ title: 'No accounts', description: 'Nothing matches this filter.' }}
      />
      <AccountDrawer account={sel} onClose={() => setSel(null)} onChanged={() => { void mutate(); void revalidatePath('/admin/stats'); setSel(null); }} />
      <GiftModal open={gift} onClose={() => { setGift(false); void mutate(); }} />
    </>
  );
}
