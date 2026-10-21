'use client';

import { useState } from 'react';
import { errMsg, post } from '@/lib/api';
import { fmtUsd0 } from '@/lib/format';

import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { revalidatePath } from '@/lib/mutate';

type Mode = 'plan' | 'custom';

/** POST /xdepartment/accounts/gift — catalogue plan or a custom size with optional rule overrides. */
export function GiftModal({ open, onClose, recipient }: { open: boolean; onClose: () => void; recipient?: { id?: string; email?: string } }) {
  const toast = useToast();
  const { pricing } = usePricing();
  const plans = pricing.plans;
  const [mode, setMode] = useState<Mode>('plan');
  const [email, setEmail] = useState(recipient?.email ?? '');
  const [planKey, setPlanKey] = useState('');
  const [type, setType] = useState<'one_step' | 'instant'>('instant');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [rules, setRules] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recip = recipient?.id ? { user_id: recipient.id } : { email: email.trim() };
  const q = Number(qty);
  const problems: string[] = [];
  if (!recipient?.id && !/^\S+@\S+\.\S+$/.test(email.trim())) problems.push('Enter the recipient’s email.');
  if (mode === 'plan' && !planKey) problems.push('Choose a plan.');
  if (mode === 'custom' && !(Number(size) >= 1000)) problems.push('Size must be at least 1,000.');
  if (!Number.isInteger(q) || q < 1 || q > 20) problems.push('Quantity must be 1–20.');
  if (reason.trim().length < 3) problems.push('A reason is required.');

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const overrides: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(rules)) {
        if (v.trim() === '') continue;
        overrides[k] = v.trim().toLowerCase() === 'none' ? null : Number(v);
      }
      const body: Record<string, unknown> = { ...recip, quantity: q, reason: reason.trim() };
      if (mode === 'plan') body.plan_key = planKey;
      else { body.custom = { type, size: Number(size) }; if (Object.keys(overrides).length) body.rules = overrides; }
      const r = await post<{ granted: number; recipient: { email: string } }>('/xdepartment/accounts/gift', body);
      toast.success(`Granted ${r.granted} account${r.granted > 1 ? 's' : ''}`, r.recipient.email);
      void revalidatePath('/admin/accounts'); void revalidatePath('/admin/users');
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const RULES: [string, string][] = [['profit_target_pct', 'Profit target %'], ['daily_dd_pct', 'Daily DD %'], ['max_dd_pct', 'Max DD %'], ['max_leverage', 'Max leverage'], ['payout_split_pct', 'Payout split %'], ['payout_cycle_days', 'Payout cycle (days)']];

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="md" title="Gift trading accounts" description="Free of charge. The recipient is notified and the action is audited."
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={problems.length > 0} onClick={submit}>Grant {Number.isInteger(q) && q > 0 ? q : ''} account{q > 1 ? 's' : ''}</Button></>}>
      <div className="space-y-4 p-5">
        {!recipient?.id && <Field label="Recipient email" htmlFor="g-email"><Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="trader@example.com" /></Field>}
        {recipient?.id && <p className="rounded-md border border-line bg-panel2 px-3 py-2 text-sm">To <b>{recipient.email}</b></p>}
        <Segmented<Mode> value={mode} onChange={setMode} ariaLabel="Gift type" options={[{ value: 'plan', label: 'Catalogue plan' }, { value: 'custom', label: 'Custom size' }]} />
        {mode === 'plan' ? (
          <Field label="Plan" htmlFor="g-plan">
            <Select id="g-plan" value={planKey} onChange={(e) => setPlanKey(e.target.value)}>
              <option value="">Select a plan…</option>
              {plans.map((p) => <option key={p.key} value={p.key}>{p.label} — list {fmtUsd0(p.price)}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="g-type"><Select id="g-type" value={type} onChange={(e) => setType(e.target.value as 'one_step' | 'instant')}><option value="instant">Instant</option><option value="one_step">One-Step</option></Select></Field>
              <Field label="Account size (USD)" htmlFor="g-size"><Input id="g-size" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} placeholder="250000" /></Field>
            </div>
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm text-muted">Override rules <span className="text-subtle">(optional — blank uses the standard rule-set; type “none” to clear a target)</span></summary>
              <div className="grid grid-cols-2 gap-3 border-t border-line p-3">
                {RULES.map(([k, l]) => <Field key={k} label={l} htmlFor={`g-${k}`}><Input id={`g-${k}`} value={rules[k] ?? ''} onChange={(e) => setRules((r) => ({ ...r, [k]: e.target.value }))} /></Field>)}
              </div>
            </details>
          </>
        )}
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Quantity" htmlFor="g-qty"><Input id="g-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Reason" htmlFor="g-reason"><Textarea id="g-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Competition prize" maxLength={300} /></Field>
        </div>
        {problems.length > 0 && <ul className="space-y-0.5 text-2xs text-subtle">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}
