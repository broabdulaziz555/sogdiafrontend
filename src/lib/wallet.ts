/**
 * Payout wallet helpers.
 *
 * The backend stores one string in `wallet_address`. We encode the USDT network into it as a prefix:
 *   `[TRC-20] TQn9…`   `[ERC-20] 0xAbc…`   `[BEP-20] 0xAbc…`
 */
export type UsdtNetwork = 'TRC-20' | 'ERC-20' | 'BEP-20';

export const NETWORKS: { value: UsdtNetwork; label: string; hint: string }[] = [
  { value: 'TRC-20', label: 'TRC-20 (Tron)', hint: 'Starts with T, 34 characters.' },
  { value: 'ERC-20', label: 'ERC-20 (Ethereum)', hint: 'Starts with 0x, 42 characters.' },
  { value: 'BEP-20', label: 'BEP-20 (BSC)', hint: 'Starts with 0x, 42 characters.' },
];

const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM = /^0x[a-fA-F0-9]{40}$/;
const TAGGED = /^\[\s*(TRC-?20|ERC-?20|BEP-?20)\s*\]\s*(\S.*)$/i;

const normNetwork = (s: string): UsdtNetwork => (s.toUpperCase().replace('-', '').replace(/^(TRC|ERC|BEP)20$/, '$1-20') as UsdtNetwork);

/** `[TRC-20] TQn9…` — exactly the format the backend stores. */
export function formatWallet(network: UsdtNetwork, address: string): string {
  return `[${network}] ${address.trim()}`;
}

export interface ParsedWallet {
  /** Network from the `[..]` tag; for an old untagged Tron address (T…) it is inferred as TRC-20. */
  network: UsdtNetwork | null;
  address: string;
  /** True only when the stored string carries an explicit `[Network]` tag. */
  tagged: boolean;
}

export function parseWallet(value: string | null | undefined): ParsedWallet {
  const v = (value ?? '').trim();
  if (!v) return { network: null, address: '', tagged: false };
  const m = TAGGED.exec(v);
  if (m) return { network: normNetwork(m[1]), address: m[2].trim(), tagged: true };
  return { network: TRON.test(v) ? 'TRC-20' : null, address: v, tagged: false };
}

/** Returns an error message, or null when the address fits the chosen network. */
export function validateWallet(network: UsdtNetwork | '', address: string): { network?: string; address?: string } {
  const errs: { network?: string; address?: string } = {};
  const a = address.trim();
  if (!network) errs.network = 'Choose the USDT network.';
  if (!a) errs.address = 'Enter your wallet address.';
  else if (network === 'TRC-20' && !TRON.test(a)) errs.address = 'A TRC-20 address starts with T and is 34 characters.';
  else if ((network === 'ERC-20' || network === 'BEP-20') && !EVM.test(a)) errs.address = `An ${network} address starts with 0x followed by 40 hex characters.`;
  else if (!network && !TRON.test(a) && !EVM.test(a)) errs.address = 'This does not look like a Tron (T…) or EVM (0x…) address.';
  return errs;
}

/** `[TRC-20] TQn9…xyz1` for compact displays. */
export function shortWallet(value: string | null | undefined): string {
  const p = parseWallet(value);
  if (!p.address) return '—';
  const a = p.address.length > 16 ? `${p.address.slice(0, 7)}…${p.address.slice(-6)}` : p.address;
  return p.tagged && p.network ? `[${p.network}] ${a}` : a;
}
