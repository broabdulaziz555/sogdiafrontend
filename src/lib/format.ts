const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const fmtUsd = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : usd.format(n));
export const fmtUsd0 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : usd0.format(n));

export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtSigned(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  const s = fmtNum(Math.abs(n), dp);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function fmtPct(n: number | null | undefined, dp = 2, signed = false): string {
  if (n == null || Number.isNaN(n)) return '—';
  const s = `${fmtNum(Math.abs(n), dp)}%`;
  if (!signed) return n < 0 ? `−${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

/** Size label: 10000 → "$10K". */
export function fmtSize(n: number): string {
  return n >= 1000 ? `$${n / 1000}K` : `$${n}`;
}

/** Price precision that mirrors exchange tick sizes closely enough for display. */
export function priceDecimals(p: number): number {
  const a = Math.abs(p);
  if (a >= 1000) return 2;
  if (a >= 100) return 2;
  if (a >= 10) return 3;
  if (a >= 1) return 4;
  if (a >= 0.1) return 5;
  if (a >= 0.01) return 6;
  return 8;
}

export function fmtPrice(p: number | null | undefined, dp?: number): string {
  if (p == null || Number.isNaN(p)) return '—';
  return fmtNum(p, dp ?? priceDecimals(p));
}

export function qtyDecimals(price: number): number {
  if (price >= 10000) return 5;
  if (price >= 1000) return 4;
  if (price >= 10) return 3;
  if (price >= 1) return 2;
  return 0;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' })}`;
}

export function timeHMS(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const fut = s < 0;
  const u = abs < 60 ? [abs, 's'] : abs < 3600 ? [Math.round(abs / 60), 'm'] : abs < 86400 ? [Math.round(abs / 3600), 'h'] : [Math.round(abs / 86400), 'd'];
  return fut ? `in ${u[0]}${u[1]}` : `${u[0]}${u[1]} ago`;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return '—';
  return a.length > 16 ? `${a.slice(0, 7)}…${a.slice(-6)}` : a;
}

export function pnlClass(n: number | null | undefined): string {
  if (!n) return 'text-muted';
  return n > 0 ? 'text-up' : 'text-down';
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
