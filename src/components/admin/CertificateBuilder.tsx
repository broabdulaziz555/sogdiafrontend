'use client';

import { useMemo, useState } from 'react';
import { Award, ExternalLink, Search, X } from 'lucide-react';
import { assetUrl, errMsg, post } from '@/lib/api';
import { dateTime, fmtUsd } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import { CERT_COPY, CERT_TYPES, certTypeLabel, type CertType } from '@/lib/certificateCopy';
import type { Account } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { Badge, Field, Input, Select, Switch, Textarea } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Section, useDebounced } from './AdminKit';

interface UserRow { id: string; email: string; full_name: string | null }
interface IssuedCert {
  id: string; type: string; amount: number; code: string; display_name: string; is_manual: boolean;
  issued_at: string; user_email: string | null; image_url: string; metadata?: Record<string, unknown>;
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-sm text-muted">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Live HTML replica of the PNG certificate (1200×850), scaled with container-query units. */
function CertificatePreview({ title, caption, name, amountLabel, amount, hideAmount, date }: {
  title: string; caption: string; name: string; amountLabel: string; amount: number | null; hideAmount: boolean; date: string;
}) {
  const BRAND = '#00E08F';
  const issued = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  // 1 design px on the 1200-wide original = 100/1200 cqw
  const u = (px: number) => `${(px / 12).toFixed(3)}cqw`;
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-line2/70" style={{ containerType: 'inline-size' }}>
      <div
        className="flex aspect-[1200/850] w-full flex-col items-center text-white"
        style={{ background: '#070B10', backgroundImage: `radial-gradient(${u(800)} ${u(500)} at 50% -15%, ${BRAND}1A, transparent)`, padding: u(56), fontFamily: 'ui-serif, Georgia, serif' }}
      >
        <div className="flex h-full w-full flex-col items-center" style={{ border: `${u(2)} solid ${BRAND}55`, borderRadius: u(24), padding: u(56) }}>
          <div className="flex items-center" style={{ gap: u(14) }}>
            <div className="grid place-items-center font-extrabold" style={{ width: u(40), height: u(40), borderRadius: u(10), background: BRAND, color: '#070B10', fontSize: u(24) }}>S</div>
            <div className="font-bold" style={{ fontSize: u(28), letterSpacing: u(8) }}>SOGDIA</div>
          </div>
          <div style={{ fontSize: u(16), letterSpacing: u(4), color: '#7D8B99', marginTop: u(12), fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>SOGDIA.SITE · INSTITUTIONAL CRYPTO PROP FIRM</div>
          <div className="text-center" style={{ fontSize: u(26), letterSpacing: u(6), color: BRAND, marginTop: u(34) }}>{title.toUpperCase()}</div>
          <div style={{ fontSize: u(20), color: '#7D8B99', marginTop: u(10) }}>This certifies that</div>
          <div className="max-w-full truncate font-bold" style={{ fontSize: u(72), marginTop: u(18), borderBottom: `${u(1)} solid ${BRAND}44`, paddingBottom: u(18) }}>{name || 'SOGDIA Trader'}</div>
          <div className="text-center" style={{ fontSize: u(24), color: '#9AA7B4', marginTop: u(26), maxWidth: u(820) }}>{caption}</div>
          {!hideAmount && (
            <div className="flex flex-col items-center" style={{ marginTop: u(44) }}>
              <div style={{ fontSize: u(18), color: '#6E7D8C', letterSpacing: u(2) }}>{amountLabel.toUpperCase()}</div>
              <div className="font-bold" style={{ fontSize: u(56), color: BRAND, marginTop: u(8) }}>{fmtUsd(amount ?? 0)}</div>
            </div>
          )}
          <div className="mt-auto flex w-full justify-between" style={{ fontSize: u(20), color: '#6E7D8C', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <div>Issued {issued}</div>
            <div>Verification code · ••••••</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserPicker({ user, onPick }: { user: UserRow | null; onPick: (u: UserRow | null) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data, isLoading } = useApi<{ users: UserRow[] }>(!user && dq.length >= 2 ? '/admin/users' : null, { query: dq, limit: 8, offset: 0 });

  if (user) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel2/60 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.full_name || user.email}</p>
          <p className="truncate text-xs text-subtle">{user.email}</p>
        </div>
        <button type="button" onClick={() => onPick(null)} aria-label="Change user" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <Input id="cb-user" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name" className="pl-9" autoComplete="off" />
      {dq.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line2 bg-panel shadow-pop">
          {isLoading && !data ? <div className="grid place-items-center py-4"><Spinner /></div>
            : !data?.users.length ? <p className="px-3 py-3 text-sm text-muted">No users match “{dq}”.</p>
            : data.users.map((u) => (
              <button key={u.id} type="button" onClick={() => { onPick(u); setQ(''); }} className="block w-full px-3 py-2 text-left hover:bg-fg/[0.05]">
                <p className="truncate text-sm">{u.full_name || u.email}</p>
                <p className="truncate text-xs text-subtle">{u.email}</p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function CertificateBuilder() {
  const toast = useToast();
  const [user, setUser] = useState<UserRow | null>(null);
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<CertType>('payout');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [amountLabel, setAmountLabel] = useState('');
  const [hideAmount, setHideAmount] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accounts = useApi<{ accounts: Account[] }>(user ? '/admin/accounts' : null, { user_id: user?.id, limit: 100, offset: 0 });
  const recent = useApi<{ certificates: IssuedCert[] }>('/admin/certificates', { limit: 20, offset: 0 });

  const d = CERT_COPY[type];
  const amt = amount === '' ? null : Number(amount);
  const amtOk = hideAmount || (amt !== null && Number.isFinite(amt) && amt >= 0);
  const nameOk = name.trim().length >= 2;
  const ready = !!user && nameOk && amtOk && !!date && (type !== 'custom' || !!title.trim());

  const pickUser = (u: UserRow | null) => {
    setUser(u); setAccountId('');
    if (u && !name.trim()) setName(u.full_name ?? '');
  };
  const pickAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.data?.accounts.find((x) => x.id === id);
    if (a && amount === '' && type !== 'payout' && type !== 'achievement') setAmount(String(a.size));
  };

  const reset = () => { setTitle(''); setCaption(''); setAmountLabel(''); setHideAmount(false); setAmount(''); setDate(todayIso()); };

  const submit = async () => {
    if (!user || !ready) return;
    setBusy(true); setErr(null);
    try {
      // Backdated: noon UTC on the chosen day. Today: leave it to the server clock.
      const issuedAt = date === todayIso() ? undefined : `${date}T12:00:00Z`;
      await post('/admin/certificates', {
        user_id: user.id,
        account_id: accountId || null,
        type,
        amount: hideAmount ? (amt ?? 0) : amt,
        display_name: name.trim(),
        title: title.trim() || undefined,
        caption: caption.trim() || undefined,
        amount_label: amountLabel.trim() || undefined,
        hide_amount: hideAmount || undefined,
        issued_at: issuedAt,
        notify,
      });
      toast.success('Certificate issued', `${certTypeLabel(type)} · ${name.trim()}`);
      void revalidatePath('/admin/certificates'); void recent.mutate();
      reset();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const rows = useMemo(() => recent.data?.certificates ?? [], [recent.data]);

  return (
    <div>
      <PageHead title="Certificate builder" subtitle="Issue a certificate of any type to any user. Leave the text fields empty to use the type’s default wording." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Section title="Details">
          <div className="space-y-3.5">
            <Field label="User" htmlFor="cb-user"><UserPicker user={user} onPick={pickUser} /></Field>
            {user && (
              <Field label="Account (optional)" htmlFor="cb-acc" hint="Links the certificate to an account; payout certificates also show its size.">
                <Select id="cb-acc" value={accountId} onChange={(e) => pickAccount(e.target.value)} disabled={accounts.isLoading}>
                  <option value="">No account</option>
                  {accounts.data?.accounts.map((a) => <option key={a.id} value={a.id}>#{a.id.slice(0, 8)} · {a.type} · {fmtUsd(a.size)} · {a.status}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Type" htmlFor="cb-type">
              <Select id="cb-type" value={type} onChange={(e) => setType(e.target.value as CertType)}>
                {CERT_TYPES.map((t) => <option key={t} value={t}>{CERT_COPY[t].label}</option>)}
              </Select>
            </Field>
            <Field label="Name on certificate" htmlFor="cb-name"><Input id="cb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ali Karimov" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (USD)" htmlFor="cb-amt"><Input id="cb-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} placeholder="2500" disabled={hideAmount} /></Field>
              <Field label="Issue date" htmlFor="cb-date"><Input id="cb-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
            <ToggleRow checked={hideAmount} onChange={setHideAmount} label="Hide the amount on the certificate" />
            <Field label={type === 'custom' ? 'Title' : 'Title (optional)'} htmlFor="cb-title"><Input id="cb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={d.title} /></Field>
            <Field label="Caption (optional)" htmlFor="cb-cap" hint="Reads after the trader’s name."><Textarea id="cb-cap" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder={d.caption} /></Field>
            {!hideAmount && <Field label="Amount label (optional)" htmlFor="cb-al"><Input id="cb-al" value={amountLabel} onChange={(e) => setAmountLabel(e.target.value)} maxLength={30} placeholder={d.amountLabel} /></Field>}
            <ToggleRow checked={notify} onChange={setNotify} label="Notify the user" />
            {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
            <Button variant="primary" block loading={busy} disabled={!ready} onClick={submit}><Award className="h-4 w-4" />Issue certificate</Button>
          </div>
        </Section>

        <div className="space-y-6">
          <Section title="Preview">
            <CertificatePreview
              title={title.trim() || d.title}
              caption={caption.trim() || d.caption}
              name={name.trim()}
              amountLabel={amountLabel.trim() || d.amountLabel}
              amount={amt !== null && Number.isFinite(amt) ? amt : null}
              hideAmount={hideAmount}
              date={date || todayIso()}
            />
          </Section>

          <Section title="Recently issued">
            {recent.error ? <ErrorState error={recent.error} onRetry={() => recent.mutate()} compact />
              : recent.isLoading && !recent.data ? <div className="grid place-items-center py-8"><Spinner /></div>
              : !rows.length ? <EmptyState title="No certificates yet" description="Issued certificates appear here." icon={<Award className="h-5 w-5" />} />
              : (
                <ul className="divide-y divide-line/60">
                  {rows.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm"><span className="truncate font-medium">{c.display_name}</span><Badge className="!py-0">{certTypeLabel(c.type)}</Badge>{c.is_manual && <Badge tone="warn" className="!py-0">Manual</Badge>}</p>
                        <p className="truncate text-xs text-subtle">{c.user_email ?? '—'} · {fmtUsd(c.amount)} · {dateTime(c.issued_at)}</p>
                      </div>
                      <a href={assetUrl(c.image_url)} target="_blank" rel="noreferrer" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg" aria-label="Open certificate image"><ExternalLink className="h-4 w-4" /></a>
                    </li>
                  ))}
                </ul>
              )}
          </Section>
        </div>
      </div>
    </div>
  );
}
