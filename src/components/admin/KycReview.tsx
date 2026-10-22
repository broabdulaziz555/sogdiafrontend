'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, FileQuestion, ListFilter, Search, ShieldCheck } from 'lucide-react';
import { errMsg, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, relTime } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import type { User } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Modal';
import { DataRow } from '@/components/ui/Panel';
import { Input, StatusBadge, Textarea } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useAction } from './AdminKit';
import { DocViewer } from './DocViewer';

type Row = User;

/** What the user row holds: a storage path (private bucket) or, for legacy rows, a full URL. */
const docRefOf = (u: Row): string | null => u.kyc_document_url || u.document_url || null;
const isHttp = (v: string | null | undefined): v is string => !!v && /^https?:\/\//i.test(v);

/**
 * KYC review — split screen. The identity document fills the left half (zoom / pan / rotate),
 * the applicant's record and the decision controls sit on the right, so the reviewer never looks away.
 */
export function KycReview() {
  const { busy, run } = useAction();
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const { data, error, isLoading, mutate } = useApi<{ users: Row[]; total: number }>('/admin/users', { kyc_status: 'pending', limit: 100, offset: 0 }, { refreshInterval: 30_000 });

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => !n || `${u.email} ${u.full_name ?? ''}`.toLowerCase().includes(n));
  }, [data, q]);

  const sel = list.find((u) => u.id === selId) ?? null;
  const idx = sel ? list.findIndex((u) => u.id === sel.id) : -1;
  useEffect(() => { if (!sel && list.length) setSelId(list[0].id); }, [list, sel]);
  useEffect(() => { setNote(''); setRejecting(false); }, [selId]);

  const step = (d: number) => { const n = list[idx + d]; if (n) setSelId(n.id); };
  const advance = () => {
    const i = list.findIndex((u) => u.id === selId);
    setSelId(list[i + 1]?.id ?? list[i - 1]?.id ?? null);
  };

  const decide = async (action: 'approve' | 'reject') => {
    if (!sel) return;
    const ok = await run(action, async () => {
      await post(`/admin/kyc/${sel.id}`, action === 'reject' ? { action, note: note.trim() } : { action });
      advance();
      await mutate();
      void revalidatePath('/admin/stats');
      return true;
    }, action === 'approve' ? `Approved ${sel.email}` : `Rejected ${sel.email}`);
    if (ok) setRejecting(false);
  };

  // The bucket is private: the user row only carries the object path, so ask the API for a short-lived signed link.
  const ref = sel ? docRefOf(sel) : null;
  const signed = useApi<{ url: string; kind: 'pdf' | 'image' }>(sel && ref && !isHttp(ref) ? `/admin/kyc/${sel.id}/document` : null, undefined, {
    refreshInterval: 50 * 60_000, // links live 1 h — renew before they lapse; a fresh one is fetched on every open
    revalidateOnFocus: false,
  });
  const url = sel ? (isHttp(ref) ? ref : signed.data?.url) ?? null : null;
  const linkLoading = !!sel && !!ref && !isHttp(ref) && signed.isLoading && !signed.data;
  const initials = (sel?.full_name || sel?.email || '?').slice(0, 2).toUpperCase();

  return (
    <>
      <PageHead
        title="KYC review"
        subtitle="Compare the document with the account details, then approve or reject with a note the trader will see."
        actions={<Button size="sm" variant="secondary" icon={<ListFilter className="h-3.5 w-3.5" />} onClick={() => setQueueOpen(true)}>Queue{data ? ` · ${data.total}` : ''}</Button>}
      />

      {error && !data ? <div className="card"><ErrorState error={error} onRetry={() => mutate()} /></div> : (
        <div className="grid min-h-[640px] gap-4 lg:h-[calc(100dvh-11rem)] lg:grid-cols-[minmax(0,1.3fr)_minmax(380px,1fr)]">
          {/* ── LEFT: document ───────────────────────────────────────────── */}
          <section className="card min-h-[360px] min-w-0 overflow-hidden bg-bg/60" aria-label="Document">
            {!sel ? <div className="grid h-full place-items-center"><EmptyState compact icon={<BadgeCheck className="h-5 w-5" />} title={isLoading && !data ? 'Loading queue…' : q ? 'No matches' : 'Queue is clear'} description={isLoading && !data ? undefined : 'No KYC submissions are waiting for review.'} /></div>
              : linkLoading ? <div className="grid h-full place-items-center text-sm text-muted">Loading document…</div>
              : url ? <DocViewer url={url} label={`${sel.full_name || sel.email} · identity document`} />
              : (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                  <FileQuestion className="h-8 w-8 text-subtle" strokeWidth={1.5} />
                  <div className="max-w-sm space-y-1.5">
                    <p className="font-medium">{ref ? 'The document could not be opened' : 'No document uploaded'}</p>
                    <p className="text-sm text-muted">{ref ? (signed.error ? errMsg(signed.error) : 'The file is missing from storage.') : 'This applicant has not uploaded an identity document yet.'}</p>
                  </div>
                  {ref && <Button size="sm" variant="secondary" onClick={() => void signed.mutate()}>Try again</Button>}
                </div>
              )}
          </section>

          {/* ── RIGHT: applicant data + decision ─────────────────────────── */}
          <section className="card flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Applicant">
            {!sel ? <div className="p-4"><Skeleton className="h-40" /></div> : (
              <>
                <header className="flex h-12 shrink-0 items-center justify-between border-b border-line/60 px-4">
                  <span className="panel-title">Applicant</span>
                  <div className="flex items-center gap-1">
                    <span className="num mr-1 font-mono text-2xs text-subtle">{idx + 1} / {list.length}</span>
                    <button onClick={() => step(-1)} disabled={idx <= 0} aria-label="Previous submission" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:border-line2 hover:text-fg disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <button onClick={() => step(1)} disabled={idx >= list.length - 1} aria-label="Next submission" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:border-line2 hover:text-fg disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="flex items-center gap-3 border-b border-line/60 px-5 py-5">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line/70 bg-gradient-to-br from-accent/20 to-accent/[0.04] text-sm font-semibold text-accent">{initials}</span>
                    <div className="min-w-0">
                      <p className="truncate text-md font-semibold">{sel.full_name || sel.email}</p>
                      {sel.full_name && <p className="truncate text-xs text-muted">{sel.email}</p>}
                    </div>
                    <span className="ml-auto"><StatusBadge status={sel.kyc_status} /></span>
                  </div>

                  <div className="px-5 py-4">
                    <p className="label mb-1">Identity</p>
                    <dl>
                      <DataRow k="Full name" v={sel.full_name || '—'} />
                      <DataRow k="Email" v={sel.email} />
                      <DataRow k="Country" v={sel.country || '—'} />
                    </dl>
                  </div>
                  <div className="border-t border-line/60 px-5 py-4">
                    <p className="label mb-1">Record</p>
                    <dl>
                      <DataRow k="User ID" v={sel.id.slice(0, 8)} mono />
                      <DataRow k="Joined" v={dateTime(sel.created_at)} />
                      <DataRow k="Account age" v={relTime(sel.created_at)} />
                      <DataRow k="Document" v={url ? 'Available' : linkLoading ? 'Loading…' : ref ? 'Unavailable' : 'Not uploaded'} tone={url ? 'up' : 'warn'} />
                    </dl>
                  </div>
                  <div className="mx-5 mb-5 rounded-2xl border border-line/60 bg-panel2/50 px-4 py-3.5">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-accent" />Check that the name matches the account, the document is unexpired, all corners are visible and the photo is genuine.</p>
                  </div>
                </div>

                <div className="shrink-0 space-y-3 border-t border-line/60 bg-panel2/40 p-5">
                  {!rejecting ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="lg" variant="danger" onClick={() => setRejecting(true)} disabled={!!busy}>Reject…</Button>
                      <Button size="lg" variant="up" loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor="kyc-note" className="label">Note for the trader</label>
                      <Textarea id="kyc-note" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Document unreadable — please upload a clear photo" maxLength={300} />
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="lg" variant="ghost" onClick={() => setRejecting(false)} disabled={!!busy}>Back</Button>
                        <Button size="lg" variant="down" loading={busy === 'reject'} disabled={note.trim().length < 3} onClick={() => decide('reject')}>Confirm reject</Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-subtle">Approving unlocks payouts for this user. After a decision the next submission opens automatically.</p>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ── Queue drawer ─────────────────────────────────────────────────── */}
      <Drawer open={queueOpen} onClose={() => setQueueOpen(false)} title="Pending reviews" subtitle={data ? `${data.total} waiting${data.total > 100 ? ' (showing first 100)' : ''}` : 'Loading…'} width="max-w-md">
        <div className="border-b border-line p-3">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or email" aria-label="Filter queue" className="pl-8" /></div>
        </div>
        <ul className="space-y-1 p-2">
          {isLoading && !data && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-10" /></li>)}
          {data && list.length === 0 && <li><EmptyState compact icon={<BadgeCheck className="h-5 w-5" />} title={q ? 'No matches' : 'Queue is clear'} description={q ? 'Nothing in the queue matches your filter.' : 'No KYC submissions are waiting for review.'} /></li>}
          {list.map((u) => (
            <li key={u.id}>
              <button onClick={() => { setSelId(u.id); setQueueOpen(false); }} aria-current={u.id === selId} className={cn('block w-full rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-fg/[0.05]', u.id === selId && 'bg-accent/[0.1] ring-1 ring-accent/30')}>
                <span className="block truncate text-sm font-medium">{u.full_name || u.email}</span>
                {u.full_name && <span className="block truncate text-xs text-muted">{u.email}</span>}
                <span className="mt-0.5 block text-2xs text-subtle">Joined {relTime(u.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
