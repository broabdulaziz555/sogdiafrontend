'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Award, CalendarDays, CandlestickChart, ChevronDown, LayoutGrid, LogOut, Menu, Plus, Settings, ShieldCheck, Users, Wallet, X, BadgeCheck, ShieldAlert,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { useUser } from '@/components/ui/AuthGate';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Badge } from '@/components/ui/Primitives';
import { SiteLink } from '@/components/ui/SiteLink';
import { Notifications } from './Notifications';
import { InstallApp } from '@/components/pwa/InstallApp';
import { clearSession } from '@/lib/auth';
import { siteHref } from '@/lib/sites';
import { cn } from '@/lib/cn';

function useNav() {
  const t = useTranslations('dash.nav');
  return [
    { href: '/', label: t('overview'), icon: LayoutGrid, exact: true },
    { href: '/calendar', label: t('calendar'), icon: CalendarDays },
    { href: '/payouts', label: t('payouts'), icon: Wallet },
    { href: '/kyc', label: t('kyc'), icon: BadgeCheck },
    { href: '/certificates', label: t('certificates'), icon: Award },
    { href: '/referrals', label: t('referrals'), icon: Users },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || '/';
  const nav = useNav();
  return (
    <nav aria-label="Dashboard" className="space-y-0.5">
      {nav.map((n) => {
        const active = n.exact ? pathname === n.href || pathname.startsWith('/accounts') : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-fg/[0.05] hover:text-fg',
            )}
          >
            {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent" aria-hidden />}
            <n.icon className="h-4 w-4 shrink-0" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const user = useUser();
  const t = useTranslations('dash.nav');
  const c = useTranslations('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const staff = user.role === 'admin' || user.role === 'xdepartment';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initials = (user.full_name || user.email).slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex h-8 items-center gap-2 rounded-md border border-line bg-panel2 pl-1 pr-2 transition-colors hover:border-subtle/60">
        <span className="grid h-6 w-6 place-items-center rounded bg-accent text-2xs font-bold text-accent-fg">{initials}</span>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 animate-scale-in overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium">{user.full_name || user.email}</p>
            {user.full_name && <p className="truncate text-xs text-muted">{user.email}</p>}
            <div className="mt-2 flex items-center gap-1.5">
              <Badge tone={user.kyc_status === 'verified' ? 'up' : 'warn'} dot>KYC {user.kyc_status.replace(/_/g, ' ')}</Badge>
              {staff && <Badge tone="accent">{user.role}</Badge>}
            </div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg"><Settings className="h-4 w-4" />{t('settings')}</Link>
            {staff && (
              <SiteLink site="xdepartment" role="menuitem" className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted hover:bg-fg/[0.06] hover:text-fg">
                <ShieldAlert className="h-4 w-4" />{t('adminPanel')}
              </SiteLink>
            )}
            <InstallApp className="h-8 rounded-md px-2.5 text-muted hover:text-fg" onDone={() => setOpen(false)} />
            <button
              role="menuitem"
              onClick={() => { clearSession(); window.location.href = siteHref('www', '/'); }}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-down hover:bg-down/10"
            >
              <LogOut className="h-4 w-4" />{c('signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('dash.nav');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const sidebarFooter = (
    <div className="space-y-2">
      <SiteLink
        site="trade"
        className="group flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_8px_24px_-10px_rgb(var(--accent)/0.55)] transition-all hover:brightness-110"
      >
        <CandlestickChart className="h-4 w-4" />{t('openTerminal')}
      </SiteLink>
      <SiteLink site="www" path="/#pricing" className="flex h-9 items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent">
        <Plus className="h-4 w-4" />{t('buyAccount')}
      </SiteLink>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-panel2/60 px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 px-3"><Logo /></Link>
        <div className="flex-1 overflow-y-auto pl-3 pr-0"><NavList /></div>
        <div className="mt-4 border-t border-line pt-4">{sidebarFooter}</div>
      </aside>

      {/* Mobile sheet */}
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label={t('menu')}>
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-left flex-col border-r border-line bg-panel px-3 py-4 [animation-name:fadeIn]">
            <div className="mb-6 flex items-center justify-between px-3">
              <Logo />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-fg/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto pl-3"><NavList onNavigate={() => setOpen(false)} /></div>
            <div className="mt-4 border-t border-line pt-4">{sidebarFooter}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} aria-label={t('menu')} className="grid h-8 w-8 place-items-center rounded-md border border-line bg-panel2 text-muted lg:hidden"><Menu className="h-4 w-4" /></button>
            <Link href="/" className="lg:hidden"><Logo /></Link>
            <p className="hidden items-center gap-1.5 text-xs text-subtle lg:flex"><ShieldCheck className="h-3.5 w-3.5 text-up" />Secure session</p>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher className="max-sm:hidden" />
            <ThemeToggle className="max-sm:hidden" />
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary label="This page">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
