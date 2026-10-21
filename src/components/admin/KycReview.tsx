'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileQuestion, Search } from 'lucide-react';
import { post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, relTime } from '@/lib/format';
import { revalidatePath } from '@/lib/mutate';
import type { User } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { Input, StatusBadge, Textarea } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { KV, useAction } from './AdminKit';
import { DocViewer } from './DocViewer';

type Row = User;

function docUrlOf(u: Row): string | null {
  const raw = u.document_url || u.kyc_document_url || null;
  return raw && /^https?:\/\//i.test(raw) ? raw : null;
}

export function KycReview() {
  const toast = useToast();
  const { busy, run } = useAction();
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [manual, setManual] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const { data, error, isLoading, mutate } = useApi<{ users: Row[]; total: number }>('/admin/users', { kyc_status: 'pending', limit: 100, offset: 0 }, { refreshInterval: 30_000 });

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => !n || `${u.email} ${u.full_name ?? ''}`.toLowerCase().includes(n));
  }, [data, q]);

  const sel = list.find((u) => u.id === selId) ?? null;
  useEffect(() => { if (!sel && list.length) setSelId(list[0].id); }, [list, sel]);
  useEffect(() => { setNote(''); setManual(''); setRejecting(false); }, [selId]);

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

  const url = sel ? docUrlOf(sel) ?? (/^https?:\/\//i.test(manual.trim()) ? manual.trim() : null) : null;

  return (
    <>
      <PageHead title="KYC review" subtitle="Compare the document with the account details, then approve or reject with a note the trader will see." />
      {error && !data ? <div className="rounded-xl border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} /></div> : (
        <div className="grid min-h-[620px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:h-[calc(100dvh-13rem)]">
          {/* queue */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel" aria-label="Pending reviews">
            <div className="border-b border-line p-3">
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter queue" aria-label="Filter queue" className="pl-8" /></div>
              <p className="mt-2 text-2xs text-subtle">{data ? `${data.total} pending${data.total > 100 ? ' (showing first 100)' : ''}` : 'Loading…'}</p>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {isLoading && !data && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-10" /></li>)}
              {data && list.length === 0 && <li><EmptyState compact icon={<BadgeCheck className="h-5 w-5" />} title={q ? 'No matches' : 'Queue is clear'} description={q ? 'Nothing in the queue matches your filter.' : 'No KYC submissions are waiting for review.'} /></li>}
              {list.map((u) => (
                <li key={u.id}>
                  <button onClick={() => setSelId(u.id)} aria-current={u.id === selId} className={cn('block w-full px-3 py-2.5 text-left transition-colors hover:bg-fg/[0.04]', u.id === selId && 'bg-accent/[0.08] shadow-[inset_2px_0_0_rgb(var(--accent))]')}>
                    <span className="block truncate text-sm font-medium">{u.full_name || u.email}</span>
                    {u.full_name && <span className="block truncate text-xs text-muted">{u.email}</span>}
                    <span className="mt-0.5 block text-2xs text-subtle">Joined {relTime(u.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* document */}
          <section className="min-h-[360px] min-w-0" aria-label="Document">
            {!sel ? <div className="grid h-full place-items-center rounded-xl border border-dashed border-line"><EmptyState compact title="Select a submission" description="Pick someone from the queue to inspect their document." /></div>
              : url ? <DocViewer url={url} label={`${sel.full_name || sel.email} · identity document`} />
              : (
                <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line p-6 text-center">
                  <FileQuestion className="h-8 w-8 text-subtle" />
                  <div className="max-w-sm space-y-1.5">
                    <p className="font-medium">No viewable document link</p>
                    <p className="text-sm text-muted">The API did not return a signed URL for this submission (<code className="font-mono text-xs">document_url</code> on the user). Paste a signed link to inspect it here.</p>
                  </div>
                  <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…signed-url" aria-label="Signed document URL" className="max-w-sm" />
                </div>
              )}
          </section>

          {/* decision */}
          <section className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-line bg-panel" aria-label="Decision">
            {!sel ? <div className="p-4"><Skeleton className="h-40" /></div> : (
              <div className="flex min-h-0 flex-1 flex-col">
                <dl className="divide-y divide-line px-4">
                  <KV k="Name" v={sel.full_name || '—'} />
                  <KV k="Email" v={sel.email} />
                  <KV k="Country" v={sel.country || '—'} />
                  <KV k="Status" v={<StatusBadge status={sel.kyc_status} />} />
                  <KV k="Joined" v={dateTime(sel.created_at)} />
                  <KV k="User ID" v={sel.id.slice(0, 8)} mono />
                </dl>
                <div className="mt-auto space-y-3 border-t border-line p-4">
                  {!rejecting ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="danger" onClick={() => setRejecting(true)} disabled={!!busy}>Reject…</Button>
                      <Button variant="up" loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor="kyc-note" className="label">Note for the trader</label>
                      <Textarea id="kyc-note" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Document unreadable — please upload a clear photo" maxLength={300} />
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="ghost" onClick={() => setRejecting(false)} disabled={!!busy}>Back</Button>
                        <Button variant="down" loading={busy === 'reject'} disabled={note.trim().length < 3} onClick={() => decide('reject')}>Confirm reject</Button>
                      </div>
                    </div>
                  )}
                  <p className="text-2xs leading-relaxed text-subtle">Approving unlocks payouts for this user. After a decision the next submission opens automatically.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
