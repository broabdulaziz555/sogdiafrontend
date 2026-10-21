'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { del, patch, post } from '@/lib/api';
import { dateShort } from '@/lib/format';
import type { AdminPromo } from '@/lib/types';
import { mutate as swrMutate } from 'swr';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Badge, Field, Input, Select, StatusBadge, Switch } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { usePricing } from '@/hooks/usePricing';
import { Section, useAction } from './AdminKit';

interface Res { promos: AdminPromo[]; count: number; settings_version: number }
const refreshSettings = () => swrMutate((k) => Array.isArray(k) && typeof k[0] === 'string' && (k[0] as string).startsWith('/xdepartment/'));

function PromoForm({ promo, onClose }: { promo: AdminPromo | 'new' | null; onClose: () => void }) {
  const toast = useToast();
  const { pricing } = usePricing();
  const isNew = promo === 'new';
  const p = promo && promo !== 'new' ? promo : null;
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [plans, setPlans] = useState<'all' | string[]>('all');
  const [expires, setExpires] = useState('');
  const [max, setMax] = useState('0');
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);

  const key = promo === null ? null : isNew ? 'new' : (promo as AdminPromo).code;
  if (key !== seeded) {
    setSeeded(key); setErr(null); setReason('');
    if (p) { setCode(p.code); setKind(p.kind); setValue(String(p.value)); setPlans(p.plans); setExpires(p.expires_at ? p.expires_at.slice(0, 10) : ''); setMax(String(p.max_uses)); setNote(p.note ?? ''); setActive(p.active); }
    else { setCode(''); setKind('percent'); setValue(''); setPlans('all'); setExpires(''); setMax('0'); setNote(''); setActive(true); }
  }

  const v = Number(value);
  const problems: string[] = [];
  if (isNew && !/^[A-Z0-9_-]{3,24}$/.test(code)) problems.push('Code: 3–24 chars, A–Z 0–9 _ -');
  if (!(v > 0) || (kind === 'percent' && v > 90)) problems.push(kind === 'percent' ? 'Percent must be between 0 and 90.' : 'Enter a USD amount above 0.');
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) problems.push('Expiry must be YYYY-MM-DD.');
  if (!Number.isInteger(Number(max)) || Number(max) < 0) problems.push('Max uses must be 0 or more.');
  if (reason.trim().length < 3) problems.push('Reason is required.');

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { kind, value: v, plans, expires_at: expires || null, max_uses: Number(max), active, note: note.trim() || null, reason: reason.trim() };
      if (isNew) await post('/xdepartment/promos', { code, ...body });
      else await patch(`/xdepartment/promos/${encodeURIComponent(p!.code)}`, body);
      toast.success(isNew ? `Promo ${code} created` : `Promo ${p!.code} updated`);
      await refreshSettings(); onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const planKeys = pricing.plans.map((x) => x.key);
  const selected = plans === 'all' ? [] : plans;

  return (
    <Modal open={promo !== null} onClose={() => !busy && onClose()} size="md" title={isNew ? 'New promo code' : `Edit ${p?.code}`} description="Edits one line of the settings document; comments and ordering are preserved."
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={problems.length > 0} onClick={submit}>{isNew ? 'Create' : 'Save'}</Button></>}>
      <div className="space-y-4 p-5">
        {isNew && <Field label="Code" htmlFor="pm-code"><Input id="pm-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} maxLength={24} className="font-mono" placeholder="BLACKFRIDAY" /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="pm-kind"><Select id="pm-kind" value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}><option value="percent">Percent off</option><option value="fixed">Fixed USD off</option></Select></Field>
          <Field label={kind === 'percent' ? 'Percent (max 90)' : 'USD off'} htmlFor="pm-val"><Input id="pm-val" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(',', '.'))} /></Field>
        </div>
        <Field label="Eligible plans" htmlFor="pm-plans">
          <Select id="pm-plans" value={plans === 'all' ? 'all' : 'some'} onChange={(e) => setPlans(e.target.value === 'all' ? 'all' : planKeys.slice(0, 1))}><option value="all">All plans</option><option value="some">Selected plans…</option></Select>
        </Field>
        {plans !== 'all' && (
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-3 sm:grid-cols-3">
            {pricing.plans.map((x) => (
              <label key={x.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(x.key)} onChange={(e) => setPlans(e.target.checked ? [...selected, x.key] : selected.filter((k) => k !== x.key))} className="accent-[rgb(var(--accent))]" />{x.label}</label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expires (UTC end of day)" htmlFor="pm-exp" hint="Empty = never"><Input id="pm-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          <Field label="Max uses" htmlFor="pm-max" hint="0 = unlimited"><Input id="pm-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        <Field label="Label shown on pricing page" htmlFor="pm-note"><Input id="pm-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} /></Field>
        <label className="flex items-center gap-3 text-sm"><Switch checked={active} onChange={setActive} label="Active" />Active</label>
        <Field label="Reason" htmlFor="pm-reason"><Input id="pm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Seasonal campaign" /></Field>
        {problems.length > 0 && <ul className="space-y-0.5 text-2xs text-subtle">{problems.map((x) => <li key={x}>• {x}</li>)}</ul>}
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

export function PromoManager() {
  const { data, error, isLoading, mutate } = useApi<Res>('/xdepartment/promos');
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<AdminPromo | 'new' | null>(null);
  const [delP, setDelP] = useState<AdminPromo | null>(null);

  const toggle = (p: AdminPromo) => run(`t-${p.code}`, async () => { await patch(`/xdepartment/promos/${encodeURIComponent(p.code)}`, { active: !p.active }); await refreshSettings(); await mutate(); }, `${p.code} ${p.active ? 'paused' : 'activated'}`);

  const cols: Column<AdminPromo>[] = useMemo(() => [
    { key: 'code', header: 'Code', sortValue: (p) => p.code, searchText: (p) => `${p.code} ${p.note ?? ''}`, cell: (p) => <span className="block min-w-0"><span className="font-mono text-sm font-semibold">{p.code}</span>{p.note && <span className="block truncate text-xs text-muted">{p.note}</span>}</span> },
    { key: 'value', header: 'Discount', sortValue: (p) => p.value, cell: (p) => <span className="num font-mono">{p.kind === 'percent' ? `${p.value}%` : `$${p.value}`}</span> },
    { key: 'plans', header: 'Plans', hideBelow: 'md', cell: (p) => (p.plans === 'all' ? <Badge>all</Badge> : <span className="text-xs text-muted" title={p.plans.join(', ')}>{p.plans.length} plan{p.plans.length > 1 ? 's' : ''}</span>) },
    { key: 'uses', header: 'Used', align: 'right', sortValue: (p) => p.uses, cell: (p) => <span className="num font-mono">{p.uses}{p.max_uses > 0 && <span className="text-subtle"> / {p.max_uses}</span>}</span> },
    { key: 'exp', header: 'Expires', hideBelow: 'sm', sortValue: (p) => (p.expires_at ? Date.parse(p.expires_at) : Infinity), cell: (p) => <span className="num text-xs text-muted">{p.expires_at ? dateShort(p.expires_at) : 'Never'}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'act', header: <span className="sr-only">Actions</span>, align: 'right', cell: (p) => (
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" loading={busy === `t-${p.code}`} onClick={() => toggle(p)}>{p.active ? 'Pause' : 'Activate'}</Button>
        <Button size="xs" variant="secondary" onClick={() => setEdit(p)}>Edit</Button>
        <Button size="xs" variant="danger" onClick={() => setDelP(p)}>Delete</Button>
      </div>) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busy]);

  return (
    <Section title="Promo codes" actions={<Button size="xs" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEdit('new')}>New promo</Button>}>
      <DataTable<AdminPromo> bare columns={cols} rows={data?.promos} rowKey={(p) => p.code} loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
        pageSize={10} searchPlaceholder="Search codes" empty={{ title: 'No promo codes', description: 'Create one to offer a discount at checkout.' }} />
      <PromoForm promo={edit} onClose={() => { setEdit(null); void mutate(); }} />
      <Modal open={!!delP} onClose={() => setDelP(null)} size="sm" title={`Delete ${delP?.code}?`} description="The code stops working immediately. Past redemptions keep their recorded code, so revenue history stays intact."
        footer={<><Button variant="ghost" onClick={() => setDelP(null)}>Cancel</Button><Button variant="down" loading={busy === 'del'} onClick={() => run('del', async () => { await del(`/xdepartment/promos/${encodeURIComponent(delP!.code)}`); await refreshSettings(); await mutate(); setDelP(null); }, `${delP?.code} deleted`)}>Delete</Button></>}>
        <p className="px-5 py-4 text-sm text-muted">{delP && delP.uses > 0 ? `${delP.uses} purchase(s) used this code. ` : ''}To pause it instead, use “Pause”.</p>
      </Modal>
    </Section>
  );
}
