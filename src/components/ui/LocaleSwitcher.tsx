'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Check, Globe } from 'lucide-react';
import { LOCALES, LOCALE_COOKIE } from '@/i18n/config';
import { ROOT_DOMAIN } from '@/lib/sites';
import { cn } from '@/lib/cn';

export function LocaleSwitcher({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const choose = (code: string) => {
    const h = location.hostname;
    const dom = h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`) ? `; Domain=.${ROOT_DOMAIN}; Secure` : '';
    document.cookie = `${LOCALE_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax${dom}`;
    setOpen(false);
    router.refresh();
  };

  const list = LOCALES.filter((l) => (l.name + l.code).toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-panel2/80 px-3 text-xs font-medium uppercase text-muted transition-colors hover:border-subtle/60 hover:text-fg"
      >
        <Globe className="h-3.5 w-3.5" />
        {locale}
      </button>
      {open && (
        <div className={cn('absolute z-[9999] mt-2 w-56 animate-scale-in overflow-hidden rounded-lg card shadow-pop', align === 'right' ? 'right-0' : 'left-0')}>
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search language"
              aria-label="Search language"
              className="h-7 w-full rounded border border-line bg-panel2 px-2 text-xs focus:border-accent focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
            {list.map((l) => (
              <li key={l.code}>
                <button
                  role="option"
                  aria-selected={l.code === locale}
                  onClick={() => choose(l.code)}
                  className={cn('flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-fg/[0.06]', l.code === locale && 'text-accent')}
                >
                  <span>{l.name}</span>
                  {l.code === locale ? <Check className="h-3.5 w-3.5" /> : <span className="font-mono text-2xs uppercase text-subtle">{l.code}</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-2 py-3 text-center text-xs text-subtle">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
