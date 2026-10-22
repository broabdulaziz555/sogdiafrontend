'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, CheckCircle2, Clock, Loader2, Pencil, Wallet } from 'lucide-react';
import { PageHead, Stat } from './PageHead';
import { accountLabel } from './AccountCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { WizardSteps } from '@/components/ui/Wizard';
import { StatStrip } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { CopyButton, Field, Input, Meter, StatusBadge } from '@/components/ui/Primitives';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/components/ui/AuthGate';
import { useAccounts } from '@/hooks/useAccounts';
import { useApi } from '@/hooks/useApi';
import { errMsg, patch, post } from '@/lib/api';
import { dateShort, dateTime, fmtNum, fmtUsd, shortAddr, shortId, titleCase } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import { mutate as globalMutate } from 'swr';
import type { Account, Eligibility, PayoutTx, User } from '@/lib/types';
import { formatWallet, parseWallet, shortWallet, validateWallet, type UsdtNetwork } from '@/lib/wallet';
import { WalletFields } from './WalletFields';

const REASON_COPY: Record<string, string> = {
  KYC_REQUIRED: 'Identity verification is not complete.',
  KYC_NOT_VERIFIED: 'Identity verification is not complete.',
  WALLET_REQUIRED: 'Add a USDT wallet address first.',
  WALLET_MISSING: 'Add a USDT wallet address first.',
  CYCLE_NOT_ELAPSED: 'The 14-day payout cycle has not elapsed yet.',
  NO_PROFIT: 'The account has no realised profit to withdraw.',
  ACCOUNT_NOT_TRADABLE: 'The account is not in a payable state.',
  MIN_TRADING_DAYS: 'Minimum trading days not reached.',
  CONSISTENCY: 'The consistency rule is not satisfied yet.',
};
const reasonText = (r: string) => REASON_COPY[r] ?? titleCase(r.toLowerCase().replace(/_/g, ' '));

/* ── Wallet card ─────────────────────────────────────────────────────────── */
function WalletCard({ user }: { user: User }) {
  const toast = useToast();
  const parsed = parseWallet(user.wallet_address);
  const [editing, setEditing] = useState(!user.wallet_address);
  const [network, setNetwork] = useState<UsdtNetwork | ''>(parsed.network ?? '');
  const [address, setAddress] = useState(parsed.address);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ network?: string; address?: string }>({});
  const [apiErr, setApiErr] = useState<string | null>(null);

  useEffect(() => {
    const w = parseWallet(user.wallet_address);
    setNetwork(w.network ?? ''); setAddress(w.address); setEditing(!user.wallet_address);
  }, [user.wallet_address]);

  const save = async () => {
    const v = validateWallet(network, address);
    setErrs(v);
    if (v.network || v.address || !network) return;
    setApiErr(null); setBusy(true);
    try {
      await patch('/me', { wallet_address: formatWallet(network, address) }); // "[TRC-20] TQn9…"
      await globalMutate('/me');
      toast.success('Wallet saved');
      setEditing(false);
    } catch (e) {
      setApiErr(errMsg(e));
    } finally { setBusy(false); }
  };

  return (
    <section className="border border-line bg-panel p-4" aria-labelledby="wallet-h">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center border border-line2 bg-panel2 text-accent"><Wallet className="h-4 w-4" /></div>
          <div>
            <h2 id="wallet-h" className="text-sm font-semibold">Payout wallet</h2>
            <p className="text-xs text-muted">USDT is sent to this address on the network you choose.</p>
          </div>
        </div>
        {!editing && <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>Change</Button>}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <WalletFields idPrefix="w" network={network} address={address} onNetwork={(n) => { setNetwork(n); setErrs((e) => ({ ...e, network: undefined })); }} onAddress={(a) => { setAddress(a); setErrs((e) => ({ ...e, address: undefined })); }} errors={errs} />
          {apiErr && <p role="alert" className="text-xs text-down">{apiErr}</p>}
          <p className="text-xs text-subtle">Double-check the address and network. Transfers cannot be reversed.</p>
          <div className="flex justify-end gap-2">
            {user.wallet_address && <Button size="sm" variant="ghost" onClick={() => { const w = parseWallet(user.wallet_address); setEditing(false); setErrs({}); setApiErr(null); setNetwork(w.network ?? ''); setAddress(w.address); }}>Cancel</Button>}
            <Button size="sm" variant="primary" loading={busy} onClick={save}>Save wallet</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 border border-line bg-panel2 px-3 py-2.5">
            <span className={`shrink-0 border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${parsed.tagged ? 'border-accent/30 bg-accent/10 text-accent' : 'border-warn/30 bg-warn/10 text-warn'}`}>{parsed.tagged ? parsed.network : 'No network'}</span>
            <code className="num min-w-0 flex-1 break-all font-mono text-sm">{parsed.address}</code>
            <CopyButton value={parsed.address} label="Copy address" />
          </div>
          {!parsed.tagged && <p role="status" className="text-xs text-warn">This wallet has no network tag. Press Change, pick the network and save before requesting a payout.</p>}
        </div>
      )}
    </section>
  );
}

/* ── Eligibility row ─────────────────────────────────────────────────────── */
function EligibilityRow({ account, onRequest }: { account: Account; onRequest: (a: Account, e: Eligibility) => void }) {
  const { data, error, isLoading, mutate } = useApi<Eligibility>('/payouts/eligibility', { account_id: account.id });
  const e = data;
  const cycleDays = account.payout_cycle_days;
  const cycleElapsed = e ? Math.max(0, Math.min(100, ((cycleDays - e.days_remaining) / cycleDays) * 100)) : 0;

  return (
    <li className="border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/accounts/${account.id}`} className="font-semibold hover:text-accent">{accountLabel(account)}</Link>
          <p className="font-mono text-2xs text-subtle">#{shortId(account.id)}</p>
        </div>
        {isLoading ? <Skeleton className="h-8 w-28" /> : error ? (
          <Button size="sm" variant="ghost" onClick={() => mutate()}>Retry</Button>
        ) : e ? (
          <Button size="sm" variant={e.eligible ? 'primary' : 'secondary'} disabled={!e.eligible} onClick={() => onRequest(account, e)} icon={<Banknote className="h-3.5 w-3.5" />}>
            {e.eligible ? 'Request payout' : 'Not eligible'}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-3 gap-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : error ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-down"><AlertCircle className="h-4 w-4" />{errMsg(error)}</p>
      ) : e ? (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="label">Profit</dt><dd className="num mt-0.5 font-mono font-medium">{fmtUsd(e.profit)}</dd></div>
            <div><dt className="label">You receive ({e.split_pct}%)</dt><dd className="num mt-0.5 font-mono font-medium text-up">{fmtUsd(e.max_payout)}</dd></div>
            <div><dt className="label">Next payout</dt><dd className="mt-0.5 font-medium">{e.next_payout_at ? dateShort(e.next_payout_at) : '—'}</dd></div>
          </dl>
          {e.days_remaining > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-2xs text-subtle"><span>Payout cycle</span><span>{e.days_remaining} day{e.days_remaining === 1 ? '' : 's'} left</span></div>
              <Meter value={cycleElapsed} className="h-1.5" />
            </div>
          )}
          {!e.eligible && e.reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {e.reasons.map((r) => <li key={r} className="flex items-start gap-2 text-xs text-muted"><Clock className="mt-0.5 h-3 w-3 shrink-0 text-warn" />{reasonText(r)}</li>)}
            </ul>
          )}
        </>
      ) : null}
    </li>
  );
}

/* ── Request wizard ──────────────────────────────────────────────────────── */
const PAYOUT_STEPS = [
  { key: 'amount', label: 'Amount' },
  { key: 'destination', label: 'Destination' },
  { key: 'review', label: 'Review' },
];

function PayoutModal({ account, elig, wallet, onClose }: { account: Account; elig: Eligibility; wallet: string | null; onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(String(elig.profit));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PayoutTx | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const walletTagged = parseWallet(wallet).tagged;
  const gross = Number(amount);
  const invalid = !Number.isFinite(gross) || gross <= 0 || gross > elig.profit + 1e-9;
  const net = invalid ? 0 : (gross * elig.split_pct) / 100;
  const fee = invalid ? 0 : gross - net;

  const submit = async () => {
    if (invalid) return;
    setBusy(true); setErr(null);
    try {
      const res = await post<{ transaction: PayoutTx }>('/payouts', { account_id: account.id, amount: Math.round(gross * 100) / 100 });
      setDone(res.transaction);
      toast.success('Payout requested', 'We will review it shortly.');
      revalidatePath('/payouts');
    } catch (e) {
      setErr(errMsg(e));
    } finally { setBusy(false); }
  };

  const SplitBar = () => (
    <div className="border border-line bg-panel2/40 p-3">
      <div className="mb-2 flex h-2 overflow-hidden bg-line" aria-hidden>
        <div className="bg-accent transition-[width]" style={{ width: `${elig.split_pct}%` }} />
      </div>
      <dl>
        <Row k="Gross profit" v={fmtUsd(invalid ? 0 : gross)} mono />
        <Row k={`SOGDIA (${100 - elig.split_pct}%)`} v={`−${fmtUsd(fee)}`} mono />
        <div className="my-1.5 border-t border-line" />
        <Row k={`You (${elig.split_pct}%) · USDT`} v={fmtUsd(net)} mono strong />
      </dl>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={done ? 'Payout requested' : 'Request a payout'}
      description={accountLabel(account)}
      footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : (
        <>
          {step === 0
            ? <Button variant="ghost" onClick={onClose}>Cancel</Button>
            : <Button variant="ghost" disabled={busy} icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => { setErr(null); setStep(step - 1); }}>Back</Button>}
          {step < 2
            ? <Button variant="primary" disabled={step === 0 ? invalid : !walletTagged} iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setStep(step + 1)}>Continue</Button>
            : <Button variant="primary" loading={busy} disabled={invalid || !walletTagged} onClick={submit}>Confirm request</Button>}
        </>
      )}
    >
      <div className="space-y-4 p-4">
        {!done && <WizardSteps steps={PAYOUT_STEPS} current={step} />}

        {done ? (
          <div className="border border-line bg-panel2/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-up"><CheckCircle2 className="h-5 w-5" /><span className="text-sm font-semibold uppercase tracking-[0.08em]">Receipt</span></div>
            <dl>
              <Row k="Reference" v={<span className="font-mono">#{shortId(done.id)}</span>} />
              <Row k="Requested" v={dateTime(done.created_at)} />
              <Row k="Gross profit" v={fmtUsd(done.amount)} mono />
              <Row k={`SOGDIA share (${100 - elig.split_pct}%)`} v={`−${fmtUsd(done.amount - done.net_amount)}`} mono />
              <div className="my-1.5 border-t border-line" />
              <Row k="You receive (USDT)" v={fmtUsd(done.net_amount)} mono strong />
              <Row k="Destination" v={<span className="font-mono">{shortWallet(done.wallet_address)}</span>} />
              <Row k="Status" v={<StatusBadge status={done.status} />} />
            </dl>
          </div>
        ) : step === 0 ? (
          <>
            <Field label="Profit to withdraw (USD)" htmlFor="pamount" error={invalid && amount !== '' ? `Enter an amount between 0.01 and ${fmtNum(elig.profit)}.` : err} hint={`Available profit: ${fmtUsd(elig.profit)}`}>
              <div className="flex gap-2">
                <Input id="pamount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="num h-10 font-mono text-md" invalid={invalid && amount !== ''} data-autofocus />
                <Button size="md" variant="outline" className="h-10" onClick={() => setAmount(String(elig.profit))}>Max</Button>
              </div>
            </Field>
            <div className="grid grid-cols-4 gap-px border border-line bg-line">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(Math.floor(elig.profit * p) / 100))} className="num bg-panel py-1.5 font-mono text-xs text-muted transition-colors hover:bg-fg/[0.05] hover:text-accent">{p}%</button>
              ))}
            </div>
            <SplitBar />
          </>
        ) : step === 1 ? (
          <>
            <div className="border border-line bg-panel2/40 p-3">
              <p className="label mb-2">Payout wallet</p>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${walletTagged ? 'border-accent/40 bg-accent/10 text-accent' : 'border-warn/40 bg-warn/10 text-warn'}`}>{walletTagged ? parseWallet(wallet).network : 'No network'}</span>
                <code className="num min-w-0 flex-1 break-all font-mono text-xs">{wallet ? parseWallet(wallet).address : 'No wallet set'}</code>
              </div>
            </div>
            {!walletTagged
              ? <p role="alert" className="flex items-start gap-2 text-sm text-warn"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{wallet ? 'Your wallet has no USDT network. Choose TRC-20, ERC-20 or BEP-20 in the Payout wallet card, then try again.' : 'Add a payout wallet first.'}</p>
              : <p className="text-xs text-subtle">USDT is sent to this address on the network shown. Transfers cannot be reversed — change the wallet from the Payout wallet card if it is wrong.</p>}
          </>
        ) : (
          <>
            <dl className="border border-line bg-panel2/40 px-3">
              <Row k="Account" v={accountLabel(account)} />
              <Row k="Gross profit" v={fmtUsd(gross)} mono />
              <Row k={`SOGDIA (${100 - elig.split_pct}%)`} v={`−${fmtUsd(fee)}`} mono />
              <Row k="Destination" v={<span className="font-mono">{wallet ? shortWallet(wallet) : '—'}</span>} />
              <div className="my-1.5 border-t border-line" />
              <Row k="You receive (USDT)" v={fmtUsd(net)} mono strong />
            </dl>
            {err && <p role="alert" className="flex items-start gap-2 text-sm text-down"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, v, mono, strong }: { k: string; v: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className={`${mono ? 'num font-mono' : ''} ${strong ? 'text-md font-bold text-up' : 'font-medium'}`}>{v}</dd>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function PayoutsPanel() {
  const user = useUser();
  const { data: me } = useApi<{ user: User }>('/me');
  const current = me?.user ?? user;
  const { accounts, isLoading: accLoading, error: accError, mutate: accMutate } = useAccounts();
  const payable = useMemo(() => (accounts ?? []).filter((a) => a.status === 'active' || a.status === 'passed'), [accounts]);
  const hist = useApi<{ transactions: PayoutTx[] }>('/payouts');
  const [target, setTarget] = useState<{ account: Account; elig: Eligibility } | null>(null);

  const rows = hist.data?.transactions;
  const totals = useMemo(() => {
    const r = rows ?? [];
    return {
      paid: r.filter((t) => t.status === 'paid').reduce((s, t) => s + t.net_amount, 0),
      pending: r.filter((t) => t.status === 'pending' || t.status === 'approved').reduce((s, t) => s + t.net_amount, 0),
    };
  }, [rows]);

  const accountById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  const cols: Column<PayoutTx>[] = [
    { key: 'date', header: 'Requested', cell: (t) => <span className="num text-muted">{dateTime(t.created_at)}</span>, sortValue: (t) => new Date(t.created_at).getTime(), searchText: (t) => t.created_at },
    { key: 'acct', header: 'Account', hideBelow: 'sm', cell: (t) => { const a = accountById.get(t.account_id); return a ? <Link href={`/accounts/${a.id}`} className="hover:text-accent">{accountLabel(a)}</Link> : <span className="font-mono text-subtle">#{shortId(t.account_id)}</span>; }, sortValue: (t) => t.account_id, searchText: (t) => { const a = accountById.get(t.account_id); return a ? accountLabel(a) : t.account_id; } },
    { key: 'gross', header: 'Gross', align: 'right', hideBelow: 'md', cell: (t) => <span className="num font-mono">{fmtUsd(t.amount)}</span>, sortValue: (t) => t.amount },
    { key: 'net', header: 'Net (USDT)', align: 'right', cell: (t) => <span className="num font-mono font-medium text-up">{fmtUsd(t.net_amount)}</span>, sortValue: (t) => t.net_amount },
    { key: 'status', header: 'Status', cell: (t) => <StatusBadge status={t.status} />, sortValue: (t) => t.status, searchText: (t) => t.status },
    { key: 'tx', header: 'Transaction', hideBelow: 'lg', cell: (t) => t.tx_hash ? <span className="inline-flex items-center gap-1 font-mono text-xs"><span>{shortAddr(t.tx_hash)}</span><CopyButton value={t.tx_hash} /></span> : <span className="text-subtle">—</span>, searchText: (t) => t.tx_hash ?? '' },
  ];

  return (
    <>
      <PageHead title="Payouts" subtitle="Request your 80% profit share every 14 days, paid in USDT." />

      <StatStrip className="mb-5">
        <Stat label="Total paid" value={fmtUsd(totals.paid)} tone={totals.paid > 0 ? 'up' : undefined} sub="Net, USDT" />
        <Stat label="In review" value={fmtUsd(totals.pending)} sub="Pending & approved" />
        <Stat label="Payouts" value={rows?.length ?? '—'} sub="All time" />
        <Stat label="KYC" value={<StatusBadge status={current.kyc_status} />} sub={current.kyc_status === 'verified' ? 'Cleared for payouts' : <Link href="/kyc" className="inline-flex items-center gap-1 text-accent hover:underline">Verify now<ArrowUpRight className="h-3 w-3" /></Link>} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 space-y-4 xl:order-1">
          <section className="border border-line bg-panel">
            <div className="panel-head"><h2 className="panel-title">Payout history</h2></div>
            <DataTable
              columns={cols}
              rows={rows}
              rowKey={(t) => t.id}
              loading={hist.isLoading && !rows}
              error={hist.error}
              onRetry={() => hist.mutate()}
              initialSort={{ key: 'date', dir: 'desc' }}
              pageSize={10}
              searchPlaceholder="Search payouts…"
              empty={{ title: 'No payouts yet', description: 'Your requests and their status will appear here.', icon: <Banknote className="h-5 w-5" /> }}
              className="border-0 rounded-none"
            />
          </section>
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <WalletCard user={current} />
          <section aria-labelledby="elig-h">
            <h2 id="elig-h" className="mb-3 px-1 text-md font-semibold">Eligible accounts</h2>
            {accError && !accounts ? (
              <div className="rounded-2xl border border-line bg-panel"><ErrorState error={accError} onRetry={() => accMutate()} /></div>
            ) : accLoading && !accounts ? (
              <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
            ) : payable.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-panel/50"><EmptyState compact icon={<Loader2 className="h-5 w-5" />} title="No payable accounts" description="Active or passed accounts will show their payout status here." /></div>
            ) : (
              <ul className="space-y-3">{payable.map((a) => <EligibilityRow key={a.id} account={a} onRequest={(account, elig) => setTarget({ account, elig })} />)}</ul>
            )}
          </section>
        </div>
      </div>

      {target && <PayoutModal account={target.account} elig={target.elig} wallet={current.wallet_address} onClose={() => { setTarget(null); revalidatePath('/payouts'); }} />}
    </>
  );
}
