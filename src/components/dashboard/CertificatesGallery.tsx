'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, RefreshCw, Search, X, ZoomIn } from 'lucide-react';
import { PageHead } from './PageHead';
import { accountLabel } from './AccountCard';
import { Badge, Input, Segmented } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import { useApi } from '@/hooks/useApi';
import { assetUrl } from '@/lib/api';
import { certTypeLabel } from '@/lib/certificateCopy';
import { saveOrOpen } from '@/lib/shareImage';
import { dateShort, fmtUsd } from '@/lib/format';
import type { Certificate } from '@/lib/types';

type Filter = 'all' | 'payout' | 'eval_pass' | 'other';
const typeLabel = certTypeLabel;

/** Saves the PNG; if the API blocks the cross-origin read it opens the image so it can be saved manually. */
async function downloadCert(c: Certificate): Promise<'saved' | 'opened'> {
  return saveOrOpen(assetUrl(c.image_url), `sogdia-certificate-${c.code}.png`);
}

function CertImage({ c, className, eager }: { c: Certificate; className?: string; eager?: boolean }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const src = `${assetUrl(c.image_url)}${attempt ? `?r=${attempt}` : ''}`;
  return (
    <div className={`relative overflow-hidden bg-panel2 ${className ?? ''}`}>
      {state === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
      {state === 'error' ? (
        <div className="absolute inset-0 grid place-items-center p-3 text-center">
          <div className="space-y-2">
            <p className="text-xs text-muted">Preview unavailable</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); setState('loading'); setAttempt((n) => n + 1); }} className="inline-flex h-7 items-center gap-1 rounded-md card px-2 text-xs hover:border-accent/60"><RefreshCw className="h-3 w-3" />Retry</button>
              <a href={src} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex h-7 items-center gap-1 rounded-md card px-2 text-xs hover:border-accent/60"><ExternalLink className="h-3 w-3" />Open</a>
            </div>
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={attempt}
          src={src}
          alt={`${typeLabel(c.type)} certificate ${c.code}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          className={`h-full w-full object-contain transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}

function Lightbox({ items, index, setIndex, onClose }: { items: Certificate[]; index: number; setIndex: (i: number) => void; onClose: () => void }) {
  const toast = useToast();
  const c = items[index];
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prev = useCallback(() => setIndex((index - 1 + items.length) % items.length), [index, items.length, setIndex]);
  const next = useCallback(() => setIndex((index + 1) % items.length), [index, items.length, setIndex]);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = o; trigger?.focus?.(); };
  }, [onClose, prev, next]);

  if (!c || typeof document === 'undefined') return null;

  const dl = async () => {
    setBusy(true);
    try { if ((await downloadCert(c)) === 'opened') toast.info('Image opened in a new tab', 'Press and hold (or right-click) the certificate to save it.'); } finally { setBusy(false); }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Certificate ${c.code}`} className="fixed inset-0 z-[95] flex flex-col bg-black/90 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{typeLabel(c.type)} · {fmtUsd(c.amount)}</p>
          <p className="font-mono text-2xs text-white/60">{c.code} · {index + 1} / {items.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" loading={busy} onClick={dl} icon={<Download className="h-3.5 w-3.5" />}>Download</Button>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16" onClick={onClose}>
        {items.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous certificate" className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"><ChevronLeft className="h-6 w-6" /></button>
            <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next certificate" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
        <div key={c.id} onClick={(e) => e.stopPropagation()} className="aspect-[1200/850] max-h-full w-full max-w-5xl animate-scale-in overflow-hidden rounded-lg shadow-pop">
          <CertImage c={c} className="h-full w-full" eager />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CertificatesGallery() {
  const { data, error, isLoading, mutate } = useApi<{ certificates: Certificate[] }>('/certificates');
  const { accounts } = useAccounts();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const accountMap = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const all = data?.certificates;

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? [])
      .filter((c) => filter === 'all' || c.type === filter || (filter === 'other' && c.type !== 'payout' && c.type !== 'eval_pass'))
      .filter((c) => !needle || `${c.code} ${c.display_name} ${typeLabel(c.type)} ${c.amount}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
  }, [all, filter, q]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <PageHead title="Certificates" subtitle="Evaluation passes and payouts, issued as shareable certificates." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" ariaLabel="Certificate type" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All${all ? ` · ${all.length}` : ''}` }, { value: 'payout', label: 'Payouts' }, { value: 'eval_pass', label: 'Evaluations' }, { value: 'other', label: 'Other' }]} />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code or name…" className="pl-9" aria-label="Search certificates" />
        </div>
      </div>

      {error && !all ? (
        <div className="rounded-2xl card"><ErrorState error={error} onRetry={() => mutate()} title="Could not load certificates" /></div>
      ) : isLoading && !all ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="overflow-hidden rounded-2xl card"><Skeleton className="aspect-[1200/850] rounded-none" /><div className="space-y-2 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel/50">
          <EmptyState
            icon={<Award className="h-5 w-5" />}
            title={all?.length ? 'No certificates match' : 'No certificates yet'}
            description={all?.length ? 'Try a different filter or search term.' : 'Pass an evaluation or receive a payout and your certificate will be issued automatically.'}
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c, i) => {
            const acct = accountMap.get(c.account_id);
            return (
              <li key={c.id} className="group overflow-hidden rounded-2xl card transition-colors hover:border-accent/50">
                <button onClick={() => setOpen(i)} className="relative block w-full text-left" aria-label={`Open certificate ${c.code}`}>
                  <CertImage c={c} className="aspect-[1200/850] w-full" />
                  <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 group-focus-within:opacity-100"><ZoomIn className="h-7 w-7 text-white" /></span>
                </button>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Badge tone={c.type === 'payout' ? 'up' : 'accent'}>{typeLabel(c.type)}</Badge>{c.is_manual && <Badge>Manual</Badge>}</div>
                    <p className="num mt-1.5 font-mono text-lg font-semibold">{fmtUsd(c.amount)}</p>
                    <p className="truncate text-xs text-muted">{dateShort(c.issued_at)}{acct ? ` · ${accountLabel(acct)}` : ''}</p>
                  </div>
                  <DownloadButton cert={c} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open !== null && items[open] && <Lightbox items={items} index={open} setIndex={setOpen} onClose={close} />}
    </>
  );
}

function DownloadButton({ cert }: { cert: Certificate }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={`Download certificate ${cert.code}`}
      disabled={busy}
      icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      onClick={async () => {
        setBusy(true);
        try { if ((await downloadCert(cert)) === 'opened') toast.info('Image opened in a new tab', 'Press and hold (or right-click) the certificate to save it.'); } finally { setBusy(false); }
      }}
    >
      PNG
    </Button>
  );
}
