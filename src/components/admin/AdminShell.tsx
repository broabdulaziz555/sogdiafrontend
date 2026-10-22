'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeCheck, CandlestickChart, ChevronDown, ChevronRight, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ScrollText, Settings2, ShieldAlert, Users, Wallet, WalletCards, X, ArrowLeftRight,
} from 'lucide-react';
import { clearSession } from '@/lib/auth';
import { InstallApp } from '@/components/pwa/InstallApp';
import { cn } from '@/lib/cn';
import { siteHref } from '@/lib/sites';
import { useUser } from '@/components/ui/AuthGate';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Logo, LogoMark } from '@/components/ui/Logo';
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

const COLLAPSE_KEY = 'sg-admin-nav-collapsed'; // per-group accordion state
const RAIL_KEY = 'sg-admin-rail'; // whole-sidebar icon rail

const isActive = (n: Item, pathname: string) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

function NavTree({ rail, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
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
    <nav aria-label="Admin" className={cn(rail ? 'space-y-1' : 'space-y-3')}>
      {GROUPS.map((g, gi) => {
        const items = g.items.filter((i) => !i.x || isX);
        if (!items.length) return null;
        const open = !collapsed[g.id];
        return (
          <div key={g.id}>
            {rail ? (
              gi > 0 && <div className="mx-3 mb-1 mt-1 h-px bg-line" aria-hidden />
            ) : (
              <button onClick={() => toggle(g.id)} aria-expanded={open} className="mb-1 flex w-full items-center justify-between px-3 text-3xs font-semibold uppercase tracking-[0.16em] text-subtle hover:text-muted">
                {g.label}<ChevronDown className={cn('h-3 w-3 transition-transform', !open && '-rotate-90')} />
              </button>
            )}
            {(rail || open) && (
              <ul className="space-y-px">
                {items.map((n) => {
                  const active = isActive(n, pathname);
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        aria-label={rail ? n.label : undefined}
                        title={rail ? n.label : undefined}
                        className={cn(
                          'relative flex h-8 items-center text-sm font-medium transition-colors',
                          rail ? 'justify-center' : 'gap-2.5 px-3',
                          active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-fg/[0.05] hover:text-fg',
                        )}
                      >
                        {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" aria-hidden />}
                        <n.icon className="h-4 w-4 shrink-0" />
                        {!rail && <>{n.label}{n.x && <XTag className="ml-auto" />}</>}
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
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex h-7 items-center gap-2 border border-line bg-panel2 pl-1 pr-2 hover:border-line2">
        <span className="grid h-5 w-5 place-items-center bg-accent text-3xs font-bold text-accent-fg">{(user.full_name || user.email).slice(0, 2).toUpperCase()}</span>
        <Badge tone={user.role === 'xdepartment' ? 'warn' : 'accent'} className="max-sm:hidden">{user.role}</Badge>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 animate-scale-in overflow-hidden border border-line2 bg-panel shadow-pop">
          <div className="border-b border-line bg-panel2/70 px-3 py-2.5"><p className="truncate text-sm font-medium">{user.full_name || user.email}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
          <div className="p-1">
            <SiteLink site="app" role="menuitem" className="flex h-8 items-center gap-2.5 px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><LayoutDashboard className="h-4 w-4" />Trader dashboard</SiteLink>
            <SiteLink site="trade" role="menuitem" className="flex h-8 items-center gap-2.5 px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><CandlestickChart className="h-4 w-4" />Terminal</SiteLink>
            <InstallApp className="h-8 px-2.5 text-muted hover:text-fg" onDone={() => setOpen(false)} />
            <button role="menuitem" onClick={() => { clearSession(); window.location.href = siteHref('www', '/'); }} className="flex h-8 w-full items-center gap-2.5 px-2.5 text-sm text-down hover:bg-down/10"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UtcClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="num hidden font-mono text-2xs text-subtle md:inline" suppressHydrationWarning>{now ? now.toISOString().slice(0, 19).replace('T', ' ') : '—'} UTC</span>;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(false);
  const pathname = usePathname() || '/';
  const isX = useUser().role === 'xdepartment';
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => { try { setRail(localStorage.getItem(RAIL_KEY) === '1'); } catch { /* ignore */ } }, []);
  const toggleRail = useCallback(() => setRail((r) => {
    try { localStorage.setItem(RAIL_KEY, r ? '0' : '1'); } catch { /* ignore */ }
    return !r;
  }), []);

  // "[" collapses / expands the sidebar, like most CRM / IDE shells
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      toggleRail();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleRail]);

  const crumb = useMemo(() => {
    for (const g of GROUPS) {
      const it = g.items.filter((i) => !i.x || isX).find((i) => isActive(i, pathname));
      if (it) return { group: g.label, page: it.label };
    }
    return { group: 'Admin', page: 'Console' };
  }, [pathname, isX]);

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-panel2 pl-safe transition-[width] duration-150 lg:flex', rail ? 'w-[52px]' : 'w-[232px]')}
        aria-label="Sidebar"
      >
        <div className={cn('flex h-11 shrink-0 items-center border-b border-line', rail ? 'justify-center' : 'px-4')}>
          <Link href="/" aria-label="Admin home">{rail ? <LogoMark className="h-6 w-6" /> : <Logo suffix="Admin" />}</Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-3"><NavTree rail={rail} /></div>
        {!rail && (
          <p className="flex items-start gap-2 border-t border-line px-3 py-3 text-2xs leading-relaxed text-subtle"><ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warn" />Every write on this site is recorded in the audit log with your identity and IP.</p>
        )}
        <button
          onClick={toggleRail}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={rail}
          title={`${rail ? 'Expand' : 'Collapse'} sidebar  [`}
          className={cn('flex h-9 shrink-0 items-center border-t border-line text-xs text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg', rail ? 'justify-center' : 'gap-2 px-3')}
        >
          {rail ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" />Collapse<span className="kbd ml-auto">[</span></>}
        </button>
      </aside>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col border-r border-line2 bg-panel pb-safe pl-safe pt-safe">
            <div className="flex h-11 items-center justify-between border-b border-line px-4"><Logo suffix="Admin" /><button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center text-muted hover:bg-fg/10"><X className="h-4 w-4" /></button></div>
            <div className="flex-1 overflow-y-auto py-3"><NavTree onNavigate={() => setOpen(false)} /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-line bg-bg/95 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-safe">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-7 w-7 place-items-center border border-line bg-panel2 text-muted lg:hidden"><Menu className="h-4 w-4" /></button>
            <Link href="/" className="lg:hidden"><LogoMark className="h-6 w-6" /></Link>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="hidden text-subtle sm:inline">{crumb.group}</span>
              <ChevronRight className="hidden h-3 w-3 text-subtle sm:block" />
              <span className="truncate font-medium text-fg">{crumb.page}</span>
            </nav>
          </div>
          <div className="flex items-center gap-3"><UtcClock /><ThemeToggle className="max-sm:hidden" /><Account /></div>
        </header>
        <main className="mx-auto w-full max-w-[1760px] flex-1 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-5 lg:pl-5 lg:pr-5">
          <ErrorBoundary label="This page">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
