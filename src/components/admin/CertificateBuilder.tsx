'use client';

import { useState } from 'react';
import { Award, Download, ExternalLink, Eye, Loader2, Search, X } from 'lucide-react';
import { assetUrl, errMsg, post } from '@/lib/api';
import { dateTime, fmtUsd } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import { saveOrOpen } from '@/lib/shareImage';
import { CERT_COPY, CERT_TYPES, certTypeLabel, type CertType } from '@/lib/certificateCopy';
import type { Account } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { Badge, Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
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

type AccountRow = Account & { user_email: string | null; user_name: string | null };

/** Search every account on the platform by id / id prefix or the owner's email / name. */
function AccountPicker({ account, onPick }: { account: AccountRow | null; onPick: (a: AccountRow | null) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data, isLoading } = useApi<{ accounts: AccountRow[] }>(!account && dq.length >= 2 ? '/admin/accounts' : null, { query: dq, limit: 10, offset: 0 });

  if (account) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel2/60 px-3 py-2">
        <div className="min-w-0">
          <p className="num truncate text-sm font-medium">#{account.id.slice(0, 8)} · {account.type} · {fmtUsd(account.size)}</p>
          <p className="truncate text-xs text-subtle">{account.user_name || account.user_email || 'Unknown owner'} · {account.status}</p>
        </div>
        <button type="button" onClick={() => onPick(null)} aria-label="Change account" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <Input id="cb-account" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account ID (e.g. a2092f) or owner email" className="pl-9" autoComplete="off" spellCheck={false} />
      {dq.length >= 2 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line2 bg-panel shadow-pop">
          {isLoading && !data ? <div className="grid place-items-center py-4"><Spinner /></div>
            : !data?.accounts.length ? <p className="px-3 py-3 text-sm text-muted">No accounts match “{dq}”.</p>
            : data.accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => { onPick(a); setQ(''); }} className="block w-full px-3 py-2 text-left hover:bg-fg/[0.05]">
                <p className="num truncate text-sm">#{a.id.slice(0, 8)} · {a.type} · {fmtUsd(a.size)} · <span className="text-subtle">{a.status}</span></p>
                <p className="truncate text-xs text-subtle">{a.user_name || a.user_email || '—'}</p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

const fileName = (c: IssuedCert) => `sogdia-certificate-${c.code}.png`;

/** Every certificate on the platform: search, view full size, download. */
function IssuedGallery({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<IssuedCert | null>(null);
  const [dl, setDl] = useState<string | null>(null);
  const size = 24;
  const { data, error, isLoading, mutate } = useApi<{ certificates: IssuedCert[]; total: number }>('/admin/certificates', { limit: size, offset: page * size, _r: refreshKey });
  const needle = q.trim().toLowerCase();
  const rows = (data?.certificates ?? []).filter((c) => !needle || [c.display_name, c.user_email, c.code, certTypeLabel(c.type)].some((v) => v?.toLowerCase().includes(needle)));
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;

  const download = async (c: IssuedCert) => {
    setDl(c.id);
    try { const r = await saveOrOpen(assetUrl(c.image_url), fileName(c)); if (r === 'opened') toast.info?.('Opened in a new tab', 'Long-press or right-click the image to save it.'); }
    catch (e) { toast.error('Download failed', errMsg(e)); } finally { setDl(null); }
  };

  return (
    <Section title={`Issued certificates${data ? ` · ${data.total}` : ''}`}>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, email, code or type" className="pl-9" aria-label="Filter certificates" />
      </div>
      {error ? <ErrorState error={error} onRetry={() => mutate()} compact />
        : isLoading && !data ? <div className="grid place-items-center py-8"><Spinner /></div>
        : !rows.length ? <EmptyState title={needle ? 'Nothing matches' : 'No certificates yet'} description={needle ? 'Try another search on this page.' : 'Issued certificates appear here.'} icon={<Award className="h-5 w-5" />} />
        : (
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {rows.map((c) => (
              <li key={c.id} className="overflow-hidden rounded-xl border border-line bg-panel2/40">
                <button type="button" onClick={() => setView(c)} className="block w-full" aria-label={`View certificate ${c.code}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(c.image_url)} alt="" loading="lazy" className="aspect-[1200/850] w-full bg-[#070B10] object-cover" />
                </button>
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm"><span className="truncate font-medium">{c.display_name}</span>{c.is_manual && <Badge tone="warn" className="!py-0">Manual</Badge>}</p>
                    <p className="truncate text-2xs text-subtle">{certTypeLabel(c.type)} · {fmtUsd(c.amount)} · {c.user_email ?? '—'}</p>
                    <p className="num truncate text-2xs text-subtle">{c.code} · {dateTime(c.issued_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setView(c)} aria-label="View" title="View" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg"><Eye className="h-4 w-4" /></button>
                    <button type="button" onClick={() => void download(c)} disabled={dl === c.id} aria-label="Download" title="Download PNG" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50">{dl === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="num text-xs text-subtle">Page {page + 1} of {pages}</span>
          <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} size="xl" title={view ? `${certTypeLabel(view.type)} · ${view.display_name}` : ''} description={view ? `${view.user_email ?? '—'} · ${view.code}` : undefined}
        footer={view && <>
          <a href={assetUrl(view.image_url)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><ExternalLink className="h-4 w-4" />Open</a>
          <Button variant="primary" loading={dl === view.id} onClick={() => void download(view)}><Download className="h-4 w-4" />Download PNG</Button>
        </>}>
        {view && (
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(view.image_url)} alt={`Certificate ${view.code}`} className="aspect-[1200/850] w-full rounded-xl bg-[#070B10] object-contain" />
          </div>
        )}
      </Modal>
    </Section>
  );
}

export function CertificateBuilder() {
  const toast = useToast();
  const [mode, setMode] = useState<'account' | 'user'>('account');
  const [user, setUser] = useState<UserRow | null>(null);
  const [accountId, setAccountId] = useState('');
  const [picked, setPicked] = useState<AccountRow | null>(null);
  const [issuedTick, setIssuedTick] = useState(0);
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

  const accounts = useApi<{ accounts: Account[] }>(mode === 'user' && user ? '/admin/accounts' : null, { user_id: user?.id, limit: 100, offset: 0 });

  const d = CERT_COPY[type];
  const amt = amount === '' ? null : Number(amount);
  const amtOk = hideAmount || (amt !== null && Number.isFinite(amt) && amt >= 0);
  const nameOk = name.trim().length >= 2;
  // by account: the account decides the recipient; by user: the account is optional
  const recipientId = mode === 'account' ? picked?.user_id ?? null : user?.id ?? null;
  const linkedAccount = mode === 'account' ? picked?.id ?? null : accountId || null;
  const ready = !!recipientId && nameOk && amtOk && !!date && (type !== 'custom' || !!title.trim());

  const pickUser = (u: UserRow | null) => {
    setUser(u); setAccountId('');
    if (u && !name.trim()) setName(u.full_name ?? '');
  };
  const pickAnyAccount = (a: AccountRow | null) => {
    setPicked(a);
    if (a && !name.trim()) setName(a.user_name ?? '');
    if (a && amount === '' && type !== 'payout' && type !== 'achievement') setAmount(String(a.size));
  };
  const pickAccount = (id: string) => {
    setAccountId(id);
    const a = accounts.data?.accounts.find((x) => x.id === id);
    if (a && amount === '' && type !== 'payout' && type !== 'achievement') setAmount(String(a.size));
  };

  const reset = () => { setTitle(''); setCaption(''); setAmountLabel(''); setHideAmount(false); setAmount(''); setDate(todayIso()); };

  const submit = async () => {
    if (!recipientId || !ready) return;
    setBusy(true); setErr(null);
    try {
      // Backdated: noon UTC on the chosen day. Today: leave it to the server clock.
      const issuedAt = date === todayIso() ? undefined : `${date}T12:00:00Z`;
      await post('/admin/certificates', {
        user_id: recipientId,
        account_id: linkedAccount,
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
      void revalidatePath('/admin/certificates'); setIssuedTick((n) => n + 1);
      reset();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Certificate builder" subtitle="Issue a certificate of any type to any user. Leave the text fields empty to use the type’s default wording." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Section title="Details">
          <div className="space-y-3.5">
            <Segmented size="sm" ariaLabel="Pick the recipient" value={mode} onChange={(v) => { setMode(v); setErr(null); }}
              options={[{ value: 'account', label: 'By account' }, { value: 'user', label: 'By user' }]} />
            {mode === 'account' ? (
              <Field label="Account" htmlFor="cb-account" hint="Any account on the platform — the certificate goes to its owner."><AccountPicker account={picked} onPick={pickAnyAccount} /></Field>
            ) : (
              <Field label="User" htmlFor="cb-user"><UserPicker user={user} onPick={pickUser} /></Field>
            )}
            {mode === 'user' && user && (
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

          <IssuedGallery refreshKey={issuedTick} />
        </div>
      </div>
    </div>
  );
}
