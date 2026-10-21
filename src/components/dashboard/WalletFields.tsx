'use client';

import { Field, Input, Select } from '@/components/ui/Primitives';
import { NETWORKS, type UsdtNetwork } from '@/lib/wallet';

/** USDT network (required) + wallet address, shared by Settings and the Payouts page. */
export function WalletFields({
  idPrefix, network, address, onNetwork, onAddress, errors, className,
}: {
  idPrefix: string;
  network: UsdtNetwork | '';
  address: string;
  onNetwork: (n: UsdtNetwork | '') => void;
  onAddress: (a: string) => void;
  errors: { network?: string; address?: string };
  className?: string;
}) {
  const hint = NETWORKS.find((n) => n.value === network)?.hint ?? 'Pick the network first — sending on the wrong chain loses the funds.';
  return (
    <div className={className ?? 'grid gap-4 sm:grid-cols-[220px_1fr]'}>
      <Field label={<>USDT network <span className="text-down" aria-hidden>*</span></>} htmlFor={`${idPrefix}-network`} error={errors.network}>
        <Select id={`${idPrefix}-network`} value={network} required aria-required="true" aria-invalid={!!errors.network || undefined} onChange={(e) => onNetwork(e.target.value as UsdtNetwork | '')}>
          <option value="">Select network…</option>
          {NETWORKS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
        </Select>
      </Field>
      <Field label={<>Wallet address <span className="text-down" aria-hidden>*</span></>} htmlFor={`${idPrefix}-address`} error={errors.address} hint={hint}>
        <Input id={`${idPrefix}-address`} value={address} onChange={(e) => onAddress(e.target.value)} placeholder={network === 'TRC-20' ? 'T…' : network ? '0x…' : 'T… or 0x…'} spellCheck={false} autoComplete="off" autoCapitalize="off" invalid={!!errors.address} className="font-mono" />
      </Field>
    </div>
  );
}
