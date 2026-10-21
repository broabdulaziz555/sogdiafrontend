'use client';

import { useEffect, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { LogOut, Save } from 'lucide-react';
import { PageHead } from './PageHead';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, StatusBadge } from '@/components/ui/Primitives';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/components/ui/AuthGate';
import { useApi } from '@/hooks/useApi';
import { useAuthActions } from '@/hooks/useAuth';
import { errMsg, patch } from '@/lib/api';
import { dateShort } from '@/lib/format';
import { siteHref } from '@/lib/sites';
import { formatWallet, parseWallet, validateWallet, type UsdtNetwork } from '@/lib/wallet';
import { WalletFields } from './WalletFields';
import type { User } from '@/lib/types';

const COUNTRIES = 'AE AF AL AM AR AT AU AZ BA BD BE BG BH BR BY CA CH CL CN CO CY CZ DE DK DZ EE EG ES FI FR GB GE GR HK HR HU ID IE IL IN IQ IR IT JO JP KE KG KR KW KZ LB LT LU LV MA MD MX MY NG NL NO NZ OM PE PH PK PL PT QA RO RS RU SA SE SG SI SK TH TJ TM TN TR TW UA US UY UZ VN ZA'.split(' ');
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (c: string) => { try { return regionNames?.of(c) ?? c; } catch { return c; } };

export function SettingsPanel() {
  const base = useUser();
  const { data } = useApi<{ user: User }>('/me');
  const user = data?.user ?? base;
  const toast = useToast();
  const { logout } = useAuthActions();

  const [name, setName] = useState(user.full_name ?? '');
  const [country, setCountry] = useState(user.country ?? '');
  const initialWallet = parseWallet(user.wallet_address);
  const [network, setNetwork] = useState<UsdtNetwork | ''>(initialWallet.network ?? '');
  const [address, setAddress] = useState(initialWallet.address);
  const [errors, setErrors] = useState<{ name?: string; network?: string; address?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const w = parseWallet(user.wallet_address);
    setName(user.full_name ?? ''); setCountry(user.country ?? ''); setNetwork(w.network ?? ''); setAddress(w.address);
  }, [user.full_name, user.country, user.wallet_address]);

  const walletEntered = address.trim() !== '';
  const walletValue = walletEntered && network ? formatWallet(network, address) : null;
  const walletDirty = walletEntered && (walletValue ?? '') !== (user.wallet_address ?? '');
  const untagged = !!user.wallet_address && !initialWallet.tagged;
  const dirty = name !== (user.full_name ?? '') || country !== (user.country ?? '') || walletDirty;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (name.trim().length > 0 && name.trim().length < 2) errs.name = 'Enter your full name.';
    if (walletEntered) Object.assign(errs, validateWallet(network, address));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, string> = {};
    if (name !== (user.full_name ?? '') && name.trim()) body.full_name = name.trim();
    if (country !== (user.country ?? '') && country) body.country = country;
    if (walletDirty && walletValue) body.wallet_address = walletValue; // e.g. "[TRC-20] TQn9…"
    setBusy(true);
    try {
      await patch('/me', body);
      await globalMutate('/me');
      await globalMutate((k) => Array.isArray(k) && k[0] === '/me');
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Could not save', errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Settings" subtitle="Your profile, payout wallet and display preferences." />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_320px]">
        <form onSubmit={save} className="rounded-2xl border border-line bg-panel p-5" noValidate>
          <h2 className="text-md font-semibold">Profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="s-email" hint="Email cannot be changed here."><Input id="s-email" value={user.email} readOnly disabled /></Field>
            <Field label="Full name" htmlFor="s-name" error={errors.name}><Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" invalid={!!errors.name} /></Field>
            <Field label="Country" htmlFor="s-country">
              <Select id="s-country" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Select…</option>
                {country && !COUNTRIES.includes(country) && <option value={country}>{countryName(country)}</option>}
                {COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </Select>
            </Field>
            <Field label="Verification"><div className="flex h-9 items-center"><StatusBadge status={user.kyc_status} /></div></Field>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">USDT payout wallet</p>
              <WalletFields idPrefix="s" network={network} address={address} onNetwork={(n) => { setNetwork(n); setErrors((e) => ({ ...e, network: undefined })); }} onAddress={(a) => { setAddress(a); setErrors((e) => ({ ...e, address: undefined })); }} errors={errors} />
              {user.wallet_address && (
                <p className="text-xs text-muted">Saved as <code className="num rounded bg-panel2 px-1.5 py-0.5 font-mono text-fg">{user.wallet_address}</code></p>
              )}
              {untagged && <p role="status" className="text-xs text-warn">Your saved wallet has no network tag. Choose the network and save so payouts go out on the right chain.</p>}
              <p className="text-xs text-subtle">Used for all payouts. Transfers cannot be reversed — double-check the address and network.</p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-subtle">Member since {dateShort(user.created_at)}</p>
            <Button type="submit" variant="primary" loading={busy} disabled={!dirty} icon={<Save className="h-4 w-4" />}>Save changes</Button>
          </div>
        </form>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-md font-semibold">Preferences</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Language</span><LocaleSwitcher /></div>
              <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">Theme</span><ThemeToggle /></div>
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-md font-semibold">Session</h2>
            <p className="mt-1 text-sm text-muted">Signing out ends your session on every SOGDIA site.</p>
            <Button className="mt-4" variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={() => { logout(); window.location.assign(siteHref('www', '/login')); }}>Sign out</Button>
          </section>
        </div>
      </div>
    </>
  );
}
