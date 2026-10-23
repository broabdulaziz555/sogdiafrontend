'use client';

import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, Keyboard, LayoutDashboard, LogOut, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/cn';
import { clearSession } from '@/lib/auth';
import { fmtNum, fmtSigned, fmtUsd } from '@/lib/format';
import { siteHref } from '@/lib/sites';
import { BUILD_ID, diagSubscribe, diagText } from '@/lib/diag';
import { Modal } from '@/components/ui/Modal';
import type { Account } from '@/lib/types';
import { Logo } from '@/components/ui/Logo';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { SiteLink } from '@/components/ui/SiteLink';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUser } from '@/components/ui/AuthGate';
import { InstallApp } from '@/components/pwa/InstallApp';
import { useTerminalData } from './data';
import { useTerminal } from './store';
import { useTerminalLayout } from './useLayout';

function Metric({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="shrink-0 rounded-xl bg-panel2/60 px-3 py-1.5 leading-tight">
      <div className="text-3xs font-medium text-subtle">{k}</div>
      <div className={cn('num text-xs font-semibold', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</div>
    </div>
  );
}

function FeedStatus({ mob }: { mob?: boolean }) {
  const sock = useTerminal((s) => s.socket);
  const tick = useTerminal((s) => s.tickerSocket);
  const priceOk = useTerminal((s) => s.pricesOk);
  const { stale } = useTerminalData();
  const feed = !priceOk ? 'down' : sock === 'live' && tick === 'live' ? 'live' : sock === 'down' && tick === 'down' ? 'down' : 'degraded';
  // Server link first: a failing poll matters more than the market-data socket.
  const state = feed === 'down' ? 'down' : stale ? 'degraded' : feed;
  const label = feed === 'down' ? 'Offline' : stale ? 'Reconnecting' : { live: 'Live', degraded: 'Partial', down: 'Offline' }[feed];
  const tip = `Engine prices: ${priceOk ? 'ok' : 'unreachable'} · Market data: ${sock} · 24h stats: ${tick} · Server: ${stale ? 'not answering, retrying' : 'ok'}`;
  return (
    <span title={tip} role="status" aria-label={`Data feed ${label}`} className={cn('inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-3xs font-semibold text-muted max-sm:border-0 max-sm:px-1', mob && 'border-0 px-1')}>
      <span className={cn('h-2 w-2 rounded-full sm:h-1.5 sm:w-1.5', state === 'live' ? 'bg-up animate-pulse-dot' : state === 'degraded' ? 'bg-warn' : 'bg-down')} /><span className={cn('max-sm:sr-only', mob && 'sr-only')}>{label}</span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="num hidden text-xs text-subtle xl:inline" suppressHydrationWarning>{now ? now.toISOString().slice(11, 19) : '--:--:--'} UTC</span>;
}

function Diagnostics({ open, onClose }: { open: boolean; onClose: () => void }) {
  const text = useSyncExternalStore(diagSubscribe, diagText, () => '');
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select manually */ } };
  return (
    <Modal open={open} onClose={onClose} title="Diagnostics" description={`App build ${BUILD_ID}. Send a screenshot of this if something looks wrong.`} size="lg"
      footer={<button onClick={() => void copy()} className="h-9 rounded-xl bg-accent px-4 text-sm font-semibold text-white">{copied ? 'Copied' : 'Copy'}</button>}>
      <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-panel2 p-3 font-mono text-2xs leading-relaxed">{text}</pre>
    </Modal>
  );
}

function UserMenu() {
  const user = useUser();
  const { resolvedTheme, setTheme } = useTheme();
  const soundOn = useTerminal((s) => s.soundOn);
  const setStore = useTerminal((s) => s.set);
  const [open, setOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
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
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel2 text-xs font-semibold hover:border-accent/60 sm:h-9 sm:w-9">{initial}</button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-[9999] w-56 overflow-hidden rounded-2xl border border-line2/70 bg-panel shadow-pop">
          <div className="border-b border-line/60 px-4 py-3"><p className="truncate text-sm font-medium">{user.full_name || 'Trader'}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
          <SiteLink site="app" path="/" role="menuitem" className="mx-1.5 mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-fg/[0.06]"><LayoutDashboard className="h-4 w-4 text-subtle" />Dashboard</SiteLink>
          <InstallApp onDone={() => setOpen(false)} />
          <button role="menuitem" onClick={() => { setOpen(false); setDiagOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06]"><Activity className="h-4 w-4 text-subtle" />Diagnostics<span className="ml-auto font-mono text-2xs text-subtle">{BUILD_ID}</span></button>
          <button role="menuitem" onClick={() => setStore({ soundOn: !soundOn })} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06] sm:hidden">{soundOn ? <Volume2 className="h-4 w-4 text-subtle" /> : <VolumeX className="h-4 w-4 text-subtle" />}Fill sounds: {soundOn ? 'on' : 'off'}</button>
          <button role="menuitem" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06] sm:hidden">{resolvedTheme === 'dark' ? <Sun className="h-4 w-4 text-subtle" /> : <Moon className="h-4 w-4 text-subtle" />}{resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
          <button role="menuitem" onClick={() => { clearSession(); window.location.replace(siteHref('www', '/login')); }} className="mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-down hover:bg-down/10"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
      <Diagnostics open={diagOpen} onClose={() => setDiagOpen(false)} />
    </div>
  );
}

function TopBarInner({ accounts, onAccountChange }: { accounts: Account[]; onAccountChange: (id: string) => void }) {
  const { accountId, account, metrics } = useTerminalData();
  const soundOn = useTerminal((s) => s.soundOn);
  const set = useTerminal((s) => s.set);
  const mob = useTerminalLayout() === 'mobile';
  const ml = metrics && metrics.used_margin > 0 ? (metrics.equity / metrics.used_margin) * 100 : null;
  const upl = metrics?.unrealized_pnl ?? 0;

  return (
    <header className="relative z-[70] flex h-[calc(3.25rem+env(safe-area-inset-top))] w-full min-w-0 shrink-0 items-center gap-2 border-b border-line/50 bg-panel/60 px-3 pt-safe backdrop-blur-xl sm:h-[calc(3.5rem+env(safe-area-inset-top))] sm:gap-4 sm:px-4">
      <SiteLink site="app" path="/" aria-label="SOGDIA dashboard" className="shrink-0"><Logo suffix="Terminal" className={cn('[&>span:nth-child(2)]:max-sm:hidden [&>span:nth-child(3)]:max-lg:hidden', mob && '[&>span:nth-child(n+2)]:hidden')} /></SiteLink>

      <label className="sr-only" htmlFor="tb-account">Trading account</label>
      <select id="tb-account" value={accountId} onChange={(e) => onAccountChange(e.target.value)}
        className={cn('h-10 min-w-0 flex-1 truncate rounded-xl border border-line bg-panel2/80 px-3 text-xs font-medium outline-none focus:border-accent', !mob && 'sm:h-10 sm:max-w-[220px] sm:flex-none md:flex-none')}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.type === 'instant' ? 'Instant' : 'One-Step'} · {fmtUsd(a.size).replace(/\.00$/, '')} · {a.id.slice(0, 6)}</option>)}
      </select>

      <div className={cn('hidden min-w-0 flex-1 items-center gap-4 overflow-x-auto scroll-none', !mob && 'md:flex')} aria-label="Account summary">
        <Metric k="Equity" v={metrics ? fmtUsd(metrics.equity) : '—'} />
        <Metric k="Unrealized" v={metrics ? fmtSigned(upl) : '—'} tone={upl > 0 ? 'up' : upl < 0 ? 'down' : undefined} />
        <Metric k="Free margin" v={metrics ? fmtUsd(metrics.free_margin) : '—'} />
        <Metric k="Margin level" v={ml == null ? '—' : `${fmtNum(ml, 0)}%`} tone={ml != null && ml < 120 ? 'down' : ml != null && ml < 200 ? 'warn' : undefined} />
        {account && <Metric k="Leverage cap" v={`${account.max_leverage}×`} />}
      </div>
      <div className={cn('hidden flex-1', !mob && 'sm:block md:hidden')} />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <FeedStatus mob={mob} />
        {!mob && <Clock />}
        <button onClick={() => set({ soundOn: !soundOn })} aria-pressed={soundOn} aria-label={soundOn ? 'Mute fill sounds' : 'Enable fill sounds'} className={cn('hidden h-9 w-9 place-items-center rounded-xl text-muted hover:bg-fg/[0.06] hover:text-fg', !mob && 'sm:grid')}>{soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button onClick={() => set({ hotkeysOpen: true })} aria-label="Keyboard shortcuts" className={cn('hidden h-9 w-9 place-items-center rounded-xl text-muted hover:bg-fg/[0.06] hover:text-fg', !mob && 'sm:grid')}><Keyboard className="h-4 w-4" /></button>
        {!mob && <ThemeToggle className="max-sm:hidden" />}
        {!mob && <LocaleSwitcher className="max-sm:hidden" />}
        <UserMenu />
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarInner);
