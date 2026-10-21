'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { post } from '@/lib/api';
import { dateTime, fmtUsd, shortAddr } from '@/lib/format';
import { parseWallet } from '@/lib/wallet';
import { revalidatePath } from '@/lib/mutate';
import type { PayoutTx } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Badge, CopyButton, Field, Input, Segmented, Select, StatusBadge, Textarea } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { KV, ReasonDialog, XTag, useIsX } from './AdminKit';

const NET_TONE = { 'TRC-20': 'info', 'ERC-20': 'accent', 'BEP-20': 'warn' } as const;

/** Prominent chain badge + the full stored string, so the admin never has to guess the network. */
function WalletCell({ value, compact }: { value: string | null; compact?: boolean }) {
  if (!value) return <span className="text-subtle">—</span>;
  const w = parseWallet(value);
  return (
    <div className="min-w-0 max-w-[420px]">
      <div className="flex items-center gap-1.5">
        {w.tagged && w.network ? <Badge tone={NET_TONE[w.network]}>{w.network}</Badge> : <Badge tone="down">No network</Badge>}
        <CopyButton value={w.address} label="Copy address" />
      </div>
      <code className={`mt-1 block break-all font-mono ${compact ? 'text-xs' : 'text-[13px]'} leading-snug`} title={value}>{value}</code>
    </div>
  );
}

const FILTERS = ['pending', 'approved', 'paid', 'rejected', ''].map((v) => ({ value: v, label: v ? v[0].toUpperCase() + v.slice(1) : 'All' }));

function MarkPaid({ tx, onClose, onDone }: { tx: PayoutTx | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [hash, setHash] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = hash.trim().length >= 8;
  const wp = parseWallet(tx?.wallet_address);
  const submit = async () => {
    if (!tx) return;
    setBusy(true); setErr(null);
    try {
      await post(`/admin/payouts/${tx.id}`, { action: 'mark_paid', tx_hash: hash.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success('Marked as paid', 'Balance debited and payout certificate issued.');
      setHash(''); setNote(''); onDone(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!tx} onClose={() => !busy && onClose()} size="md" title="Mark payout as paid" description={tx ? `Send ${fmtUsd(tx.net_amount)} USDT to the wallet below, then record the transaction hash.` : undefined}
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="up" loading={busy} disabled={!ok} onClick={submit}>Confirm paid</Button></>}>
      {tx && (
        <div className="space-y-4 p-5">
          <dl className="divide-y divide-line rounded-lg border border-line px-3">
            <KV k="Send (net, USDT)" v={<b className="num font-mono text-up">{fmtUsd(tx.net_amount)}</b>} />
            <KV k="Gross debited from balance" v={fmtUsd(tx.amount)} mono />
            <KV k="Network" v={wp.tagged && wp.network ? <Badge tone={NET_TONE[wp.network]}>{wp.network}</Badge> : <Badge tone="down">Not specified</Badge>} />
            <KV k="Wallet" v={tx.wallet_address ? <span className="inline-flex items-center gap-1.5 break-all text-left">{tx.wallet_address}<CopyButton value={wp.address} label="Copy address" /></span> : '—'} mono />
          </dl>
          {!wp.tagged && <p role="alert" className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">This wallet has no network tag. Confirm the chain with the trader before sending.</p>}
          <Field label="Transaction hash" htmlFor="p-hash"><Input id="p-hash" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x… or TRON txid" autoComplete="off" spellCheck={false} className="font-mono" /></Field>
          <Field label="Note (optional)" htmlFor="p-note"><Textarea id="p-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. TRC20 sent" maxLength={200} /></Field>
          <p className="text-2xs text-subtle">This debits the gross amount, stamps the next payout date and auto-issues a payout certificate. Double-check the hash — it is shown to the trader.</p>
          {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function ForceModal({ tx, onClose, onDone }: { tx: PayoutTx | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState('paid');
  const [hash, setHash] = useState('');
  const [skip, setSkip] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!tx) return;
    setBusy(true); setErr(null);
    try {
      await post(`/xdepartment/payouts/${tx.id}/force`, { status, ...(hash.trim() ? { tx_hash: hash.trim() } : {}), note: note.trim(), skip_balance_debit: skip });
      toast.success(`Payout forced to ${status}`); onDone(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!tx} onClose={() => !busy && onClose()} size="sm" title="Force payout state" description="Overrides the workflow, including re-opening a settled payout."
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="down" loading={busy} disabled={note.trim().length < 3} onClick={submit}>Force</Button></>}>
      <div className="space-y-3 p-5">
        <Field label="Status" htmlFor="f-status"><Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>{['pending', 'approved', 'paid', 'rejected', 'failed'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Tx hash (optional)" htmlFor="f-hash"><Input id="f-hash" value={hash} onChange={(e) => setHash(e.target.value)} className="font-mono" /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="mt-1 accent-[rgb(var(--accent))]" /><span>Skip balance debit<span className="block text-2xs text-subtle">Use when correcting a mistaken settlement.</span></span></label>
        <Field label="Note / reason" htmlFor="f-note"><Textarea id="f-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

export function PayoutQueue() {
  const isX = useIsX();
  const toast = useToast();
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayoutTx | null>(null);
  const [rejecting, setRejecting] = useState<PayoutTx | null>(null);
  const [forcing, setForcing] = useState<PayoutTx | null>(null);
  const { data, error, isLoading, mutate } = useApi<{ transactions: PayoutTx[] }>('/payouts', { status: filter || undefined }, { refreshInterval: 30_000 });
  const done = () => { void mutate(); void revalidatePath('/admin/stats'); };

  const approve = async (tx: PayoutTx) => {
    setBusyId(tx.id);
    try { await post(`/admin/payouts/${tx.id}`, { action: 'approve' }); toast.success('Payout approved'); done(); } catch (e) { toast.error('Approve failed', e instanceof Error ? e.message : undefined); } finally { setBusyId(null); }
  };

  const cols: Column<PayoutTx>[] = useMemo(() => [
    { key: 'who', header: 'Request', sortValue: (t) => t.user_email ?? t.id, searchText: (t) => `${t.user_email ?? ''} ${t.id} ${t.account_id} ${t.wallet_address ?? ''} ${t.tx_hash ?? ''}`,
      cell: (t) => <span className="block min-w-0"><span className="block truncate font-medium">{t.user_email ?? `Account ${t.account_id.slice(0, 8)}`}</span><span className="block font-mono text-2xs text-subtle">{t.id.slice(0, 8)} · acct {t.account_id.slice(0, 8)}</span></span> },
    { key: 'amount', header: 'Gross', align: 'right', hideBelow: 'sm', sortValue: (t) => t.amount, cell: (t) => <span className="num font-mono text-muted">{fmtUsd(t.amount)}</span> },
    { key: 'net', header: 'Send (net)', align: 'right', sortValue: (t) => t.net_amount, cell: (t) => <span className="num font-mono font-semibold">{fmtUsd(t.net_amount)}</span> },
    { key: 'wallet', header: 'Wallet (network + address)', searchText: (t) => t.wallet_address ?? '', cell: (t) => <WalletCell value={t.wallet_address} compact /> },
    { key: 'status', header: 'Status', sortValue: (t) => t.status, cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'tx', header: 'Tx hash', hideBelow: 'lg', cell: (t) => t.tx_hash ? <span className="inline-flex items-center gap-1 font-mono text-xs" title={t.tx_hash}>{shortAddr(t.tx_hash)}<CopyButton value={t.tx_hash} /></span> : <span className="text-subtle">—</span> },
    { key: 'created', header: 'Requested', align: 'right', hideBelow: 'md', sortValue: (t) => Date.parse(t.created_at), cell: (t) => <span className="num text-xs text-muted">{dateTime(t.created_at)}</span> },
    { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', cell: (t) => (
      <div className="flex justify-end gap-1.5">
        {t.status === 'pending' && <Button size="xs" variant="secondary" loading={busyId === t.id} onClick={() => approve(t)}>Approve</Button>}
        {(t.status === 'pending' || t.status === 'approved') && <>
          <Button size="xs" variant="up" icon={<Check className="h-3 w-3" />} onClick={() => setPaying(t)}>Mark paid</Button>
          <Button size="xs" variant="danger" onClick={() => setRejecting(t)}>Reject</Button>
        </>}
        {isX && <Button size="xs" variant="ghost" onClick={() => setForcing(t)} title="Force state (X-Department)">Force<XTag className="ml-1" /></Button>}
      </div>) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busyId, isX]);

  return (
    <>
      <PageHead title="Payout queue" subtitle="Approve, send USDT, then mark as paid with the transaction hash. Payout = 80% of profit; the net amount is what you send." />
      <DataTable<PayoutTx>
        columns={cols} rows={data?.transactions} rowKey={(t) => t.id} loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
        pageSize={25} searchPlaceholder="Search email, wallet, hash" initialSort={{ key: 'created', dir: 'asc' }}
        toolbar={<Segmented value={filter} onChange={setFilter} options={FILTERS} size="sm" ariaLabel="Payout status" />}
        empty={{ title: filter === 'pending' ? 'No pending payouts' : 'No payouts here', description: 'Requests from traders appear as soon as they are submitted.' }}
      />
      <MarkPaid tx={paying} onClose={() => setPaying(null)} onDone={done} />
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} title="Reject payout" description={rejecting ? `${fmtUsd(rejecting.net_amount)} · ${rejecting.user_email ?? rejecting.account_id.slice(0, 8)}` : undefined} confirmLabel="Reject" tone="down" label="Reason (shown to the trader)" placeholder="e.g. Suspicious trading pattern"
        onConfirm={async (note) => { await post(`/admin/payouts/${rejecting!.id}`, { action: 'reject', note }); toast.success('Payout rejected'); done(); }} />
      <ForceModal tx={forcing} onClose={() => setForcing(null)} onDone={done} />
    </>
  );
}
