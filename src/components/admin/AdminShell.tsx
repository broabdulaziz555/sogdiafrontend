'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeCheck, CandlestickChart, ChevronDown, FileClock, LayoutDashboard, LogOut, Menu, ScrollText, Settings2, ShieldAlert, Users, Wallet, WalletCards, X, ArrowLeftRight,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { siteHref } from '@/lib/sites';
import { useUser } from '@/components/ui/AuthGate';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Logo } from '@/components/ui/Logo';
import { SiteLink } from '@/components/ui/SiteLink';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Badge } from '@/components/ui/Primitives';
import { XTag } from './AdminKit';

interface Item { href: string; label: string; icon: typeof Users; exact?: boolean; x?: boolean }
interface Group { id: string; label: string; items: Item[] }

const GROUPS: Group[] = [
  { id: 'overview', label: 'Overview', items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }] },
  { id: 'people', label: 'People', items: [
    { href: '/users', label: 'Users', icon: Users },
    { href: '/kyc', label: 'KYC review', icon: BadgeCheck },
  ] },
  { id: 'money', label: 'Accounts & money', items: [
    { href: '/accounts', label: 'Accounts', icon: WalletCards },
    { href: '/trades', label: 'Trades', icon: ArrowLeftRight },
    { href: '/payouts', label: 'Payout queue', icon: Wallet },
  ] },
  { id: 'platform', label: 'Platform', items: [
    { href: '/settings', label: 'Settings', icon: Settings2, x: true },
    { href: '/audit', label: 'Audit logs', icon: ScrollText, x: true },
  ] },
];

const COLLAPSE_KEY = 'sg-admin-nav-collapsed';

function NavTree({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || '/';
  const isX = useUser().role === 'xdepartment';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => { try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')); } catch { /* ignore */ } }, []);
  const toggle = (id: string) => setCollapsed((c) => {
    const n = { ...c, [id]: !c[id] };
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });

  return (
    <nav aria-label="Admin" className="space-y-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.x || isX);
        if (!items.length) return null;
        const open = !collapsed[g.id];
        return (
          <div key={g.id}>
            <button onClick={() => toggle(g.id)} aria-expanded={open} className="mb-1 flex w-full items-center justify-between px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-subtle hover:text-muted">
              {g.label}<ChevronDown className={cn('h-3 w-3 transition-transform', !open && '-rotate-90')} />
            </button>
            {open && (
              <ul className="ml-3 space-y-0.5 border-l border-line pl-2">
                {items.map((n) => {
                  const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
                  return (
                    <li key={n.href}>
                      <Link href={n.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                        className={cn('flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors', active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-fg/[0.05] hover:text-fg')}>
                        <n.icon className="h-4 w-4 shrink-0" />{n.label}{n.x && <XTag className="ml-auto" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Account() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 pl-1 pr-2 hover:border-subtle/60">
        <span className="grid h-6 w-6 place-items-center rounded bg-accent text-2xs font-bold text-accent-fg">{(user.full_name || user.email).slice(0, 2).toUpperCase()}</span>
        <Badge tone={user.role === 'xdepartment' ? 'warn' : 'accent'} className="max-sm:hidden">{user.role}</Badge>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 animate-scale-in overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
          <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-medium">{user.full_name || user.email}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
          <div className="p-1.5">
            <SiteLink site="app" role="menuitem" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><LayoutDashboard className="h-4 w-4" />Trader dashboard</SiteLink>
            <SiteLink site="trade" role="menuitem" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><CandlestickChart className="h-4 w-4" />Terminal</SiteLink>
            <button role="menuitem" onClick={() => { clearSession(); window.location.href = siteHref('www', '/'); }} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-down hover:bg-down/10"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-panel2/60 px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 px-3"><Logo suffix="Admin" /></Link>
        <div className="flex-1 overflow-y-auto"><NavTree /></div>
        <p className="mt-4 flex items-start gap-2 border-t border-line px-3 pt-4 text-2xs leading-relaxed text-subtle"><ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warn" />Every write on this site is recorded in the audit log with your identity and IP.</p>
      </aside>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-panel px-3 py-4">
            <div className="mb-6 flex items-center justify-between px-3"><Logo suffix="Admin" /><button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-fg/10"><X className="h-4 w-4" /></button></div>
            <div className="flex-1 overflow-y-auto"><NavTree onNavigate={() => setOpen(false)} /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-8 w-8 place-items-center rounded-md border border-line bg-panel2 text-muted lg:hidden"><Menu className="h-4 w-4" /></button>
            <Link href="/" className="lg:hidden"><Logo suffix="Admin" /></Link>
            <p className="hidden items-center gap-1.5 text-xs text-subtle lg:flex"><FileClock className="h-3.5 w-3.5" />Staff console · times are shown in your local time zone</p>
          </div>
          <div className="flex items-center gap-2"><ThemeToggle className="max-sm:hidden" /><Account /></div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary label="This page">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
