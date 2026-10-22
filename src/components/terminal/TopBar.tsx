'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Keyboard, LayoutDashboard, LogOut, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/cn';
import { clearSession } from '@/lib/auth';
import { fmtNum, fmtSigned, fmtUsd } from '@/lib/format';
import { siteHref } from '@/lib/sites';
import type { Account } from '@/lib/types';
import { Logo } from '@/components/ui/Logo';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { SiteLink } from '@/components/ui/SiteLink';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUser } from '@/components/ui/AuthGate';
import { InstallApp } from '@/components/pwa/InstallApp';
import { useTerminalData } from './data';
import { useTerminal } from './store';

function Metric({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="shrink-0 leading-tight">
      <div className="text-2xs uppercase tracking-wider text-subtle">{k}</div>
      <div className={cn('num font-mono text-sm', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</div>
    </div>
  );
}

function FeedStatus() {
  const sock = useTerminal((s) => s.socket);
  const tick = useTerminal((s) => s.tickerSocket);
  const priceOk = useTerminal((s) => s.pricesOk);
  const state = !priceOk ? 'down' : sock === 'live' && tick === 'live' ? 'live' : sock === 'down' && tick === 'down' ? 'down' : 'degraded';
  const label = { live: 'Live', degraded: 'Partial', down: 'Offline' }[state];
  const tip = `Engine prices: ${priceOk ? 'ok' : 'unreachable'} · Market data: ${sock} · 24h stats: ${tick}`;
  return (
    <span title={tip} role="status" aria-label={`Data feed ${label}`} className="inline-flex items-center gap-1.5 rounded border border-line px-1.5 py-1 text-2xs font-medium uppercase tracking-wider text-muted max-sm:border-0 max-sm:px-1">
      <span className={cn('h-2 w-2 rounded-full sm:h-1.5 sm:w-1.5', state === 'live' ? 'bg-up animate-pulse' : state === 'degraded' ? 'bg-warn' : 'bg-down')} /><span className="max-sm:sr-only">{label}</span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="num hidden font-mono text-xs text-subtle xl:inline" suppressHydrationWarning>{now ? now.toISOString().slice(11, 19) : '--:--:--'} UTC</span>;
}

function UserMenu() {
  const user = useUser();
  const { resolvedTheme, setTheme } = useTheme();
  const soundOn = useTerminal((s) => s.soundOn);
  const setStore = useTerminal((s) => s.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const initial = (user.full_name || user.email || '?').trim()[0]?.toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel2 text-xs font-semibold hover:border-accent/60 sm:h-8 sm:w-8">{initial}</button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-lg border border-line bg-panel shadow-2xl">
          <div className="border-b border-line px-3 py-2"><p className="truncate text-sm font-medium">{user.full_name || 'Trader'}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
          <SiteLink site="app" path="/" role="menuitem" className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-fg/[0.06]"><LayoutDashboard className="h-4 w-4 text-subtle" />Dashboard</SiteLink>
          <InstallApp onDone={() => setOpen(false)} />
          <button role="menuitem" onClick={() => setStore({ soundOn: !soundOn })} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06] sm:hidden">{soundOn ? <Volume2 className="h-4 w-4 text-subtle" /> : <VolumeX className="h-4 w-4 text-subtle" />}Fill sounds: {soundOn ? 'on' : 'off'}</button>
          <button role="menuitem" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06] sm:hidden">{resolvedTheme === 'dark' ? <Sun className="h-4 w-4 text-subtle" /> : <Moon className="h-4 w-4 text-subtle" />}{resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
          <button role="menuitem" onClick={() => { clearSession(); window.location.replace(siteHref('www', '/login')); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-down hover:bg-down/10"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function TopBarInner({ accounts, onAccountChange }: { accounts: Account[]; onAccountChange: (id: string) => void }) {
  const { accountId, account, metrics } = useTerminalData();
  const soundOn = useTerminal((s) => s.soundOn);
  const set = useTerminal((s) => s.set);
  const ml = metrics && metrics.used_margin > 0 ? (metrics.equity / metrics.used_margin) * 100 : null;
  const upl = metrics?.unrealized_pnl ?? 0;

  return (
    <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-line bg-panel px-2 sm:gap-4 sm:px-3">
      <SiteLink site="app" path="/" aria-label="SOGDIA dashboard" className="shrink-0"><Logo suffix="Terminal" className="[&>span:nth-child(2)]:max-sm:hidden [&>span:nth-child(3)]:max-lg:hidden" /></SiteLink>

      <label className="sr-only" htmlFor="tb-account">Trading account</label>
      <select id="tb-account" value={accountId} onChange={(e) => onAccountChange(e.target.value)}
        className="h-9 min-w-0 flex-1 truncate rounded-md border border-line bg-panel2 px-2 text-xs font-medium outline-none focus:border-accent sm:h-8 sm:max-w-[210px] sm:flex-none md:flex-none">
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.type === 'instant' ? 'Instant' : 'One-Step'} · {fmtUsd(a.size).replace(/\.00$/, '')} · {a.id.slice(0, 6)}</option>)}
      </select>

      <div className="hidden min-w-0 flex-1 items-center gap-6 overflow-x-auto scroll-none md:flex" aria-label="Account summary">
        <Metric k="Equity" v={metrics ? fmtUsd(metrics.equity) : '—'} />
        <Metric k="Unrealized" v={metrics ? fmtSigned(upl) : '—'} tone={upl > 0 ? 'up' : upl < 0 ? 'down' : undefined} />
        <Metric k="Free margin" v={metrics ? fmtUsd(metrics.free_margin) : '—'} />
        <Metric k="Margin level" v={ml == null ? '—' : `${fmtNum(ml, 0)}%`} tone={ml != null && ml < 120 ? 'down' : ml != null && ml < 200 ? 'warn' : undefined} />
        {account && <Metric k="Leverage cap" v={`${account.max_leverage}×`} />}
      </div>
      <div className="hidden flex-1 sm:block md:hidden" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <FeedStatus />
        <Clock />
        <button onClick={() => set({ soundOn: !soundOn })} aria-pressed={soundOn} aria-label={soundOn ? 'Mute fill sounds' : 'Enable fill sounds'} className="hidden h-8 w-8 place-items-center rounded-md sm:grid text-muted hover:bg-fg/[0.06] hover:text-fg">{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button onClick={() => set({ hotkeysOpen: true })} aria-label="Keyboard shortcuts" className="hidden h-8 w-8 place-items-center rounded-md text-muted hover:bg-fg/[0.06] hover:text-fg sm:grid"><Keyboard className="h-4 w-4" /></button>
        <ThemeToggle className="max-sm:hidden" />
        <LocaleSwitcher className="max-sm:hidden" />
        <UserMenu />
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarInner);
