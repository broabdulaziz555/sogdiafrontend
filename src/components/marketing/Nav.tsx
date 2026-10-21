'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { useSiteHref } from '@/components/ui/SiteLink';
import { useHasSession } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

export function Nav() {
  const t = useTranslations('nav');
  const c = useTranslations('common');
  const href = useSiteHref();
  const has = useHasSession();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const links = [
    { href: '/#how', label: t('how') },
    { href: '/#rules', label: t('rules') },
    { href: '/#platform', label: t('platform') },
    { href: '/#pricing', label: t('pricing') },
    { href: '/#faq', label: t('faq') },
  ];

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-all duration-300',
        scrolled ? 'border-line bg-bg/75 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/60' : 'border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="SOGDIA home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher className="max-sm:hidden" />
          <ThemeToggle className="max-sm:hidden" />
          {has ? (
            <a
              href={href('app', '/')}
              className="group hidden h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg transition-all hover:brightness-110 sm:inline-flex"
            >
              {c('dashboard')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          ) : (
            <>
              <Link href="/login" className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:text-fg sm:inline-flex">
                {c('signIn')}
              </Link>
              <Link
                href="/#pricing"
                className="group hidden h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_8px_24px_-10px_rgb(var(--accent)/0.55)] transition-all hover:brightness-110 sm:inline-flex"
              >
                {t('getFunded')} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? t('closeMenu') : t('openMenu')}
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-md border border-line bg-panel2 text-muted hover:text-fg lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 animate-fade-in overflow-y-auto border-t border-line bg-bg/95 backdrop-blur-xl lg:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col p-4">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-line py-4 text-lg font-medium">
                {l.label}
              </Link>
            ))}
            <div className="mt-6 flex items-center gap-3">
              <LocaleSwitcher align="left" />
              <ThemeToggle />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {has ? (
                <a href={href('app', '/')} className="col-span-2 grid h-11 place-items-center rounded-lg bg-accent font-semibold text-accent-fg">{c('dashboard')}</a>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="grid h-11 place-items-center rounded-lg border border-line font-semibold">{c('signIn')}</Link>
                  <Link href="/register" onClick={() => setOpen(false)} className="grid h-11 place-items-center rounded-lg bg-accent font-semibold text-accent-fg">{c('signUp')}</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
