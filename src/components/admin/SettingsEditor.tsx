'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Save, ShieldCheck, Undo2 } from 'lucide-react';
import { ApiError, put } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime } from '@/lib/format';
import { mutate as swrMutate } from 'swr';
import type { SettingsDoc, SettingsIssue } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ReasonDialog, Section, XTag, issuesOf } from './AdminKit';
import { PromoManager } from './PromoManager';

const LH = 20;

interface SaveResult { valid: boolean; raw: string; parsed: Record<string, unknown>; version: number; updated_at: string; warnings?: SettingsIssue[]; normalized_raw?: string }
interface Check { warnings: SettingsIssue[]; normalized: string | null; same: boolean }

function Editor({ value, onChange, errors, warnings, taRef }: { value: string; onChange: (v: string) => void; errors: Set<number>; warnings: Set<number>; taRef: React.RefObject<HTMLTextAreaElement> }) {
  const gutter = useRef<HTMLDivElement>(null);
  const bands = useRef<HTMLDivElement>(null);
  const count = value.split('\n').length;
  const sync = () => {
    const t = taRef.current;
    if (!t) return;
    if (gutter.current) gutter.current.scrollTop = t.scrollTop;
    if (bands.current) bands.current.scrollTop = t.scrollTop;
  };
  const lines = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count]);

  return (
    <div className="flex overflow-hidden rounded-xl border border-line bg-panel2/40 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <div ref={gutter} aria-hidden className="w-12 shrink-0 select-none overflow-hidden border-r border-line bg-panel2 py-3 pr-2 text-right font-mono text-[13px] text-subtle" style={{ lineHeight: `${LH}px` }}>
        {lines.map((n) => <div key={n} style={{ height: LH }} className={cn(errors.has(n) && 'font-bold text-down', !errors.has(n) && warnings.has(n) && 'text-warn')}>{n}</div>)}
      </div>
      <div className="relative min-w-0 flex-1">
        <div ref={bands} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden py-3">
          {lines.map((n) => <div key={n} style={{ height: LH }} className={cn(errors.has(n) && 'bg-down/15 shadow-[inset_2px_0_0_rgb(var(--down))]', !errors.has(n) && warnings.has(n) && 'bg-warn/10')} />)}
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Platform settings document"
          aria-describedby="settings-help"
          className="relative block h-[460px] w-full resize-y overflow-auto whitespace-pre bg-transparent px-3 py-3 font-mono text-[13px] outline-none"
          style={{ lineHeight: `${LH}px`, tabSize: 2 }}
        />
      </div>
    </div>
  );
}

export function SettingsEditor() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<SettingsDoc>('/xdepartment/settings', undefined, { revalidateOnFocus: false });
  const [text, setText] = useState('');
  const [base, setBase] = useState<string | null>(null); // the raw we last loaded or saved
  const [issues, setIssues] = useState<SettingsIssue[]>([]);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState<'validate' | null>(null);
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const dirty = base !== null && text !== base;
  const serverChanged = data && base !== null && data.raw !== base;

  // first load, and when the doc changes server-side while the editor is clean
  useEffect(() => {
    if (!data) return;
    if (base === null || (!dirty && data.raw !== base)) { setText(data.raw); setBase(data.raw); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const edit = (v: string) => { setText(v); if (issues.length) setIssues([]); if (check) setCheck(null); };

  const errLines = useMemo(() => new Set(issues.map((i) => i.line).filter((l): l is number => l != null)), [issues]);
  const warnLines = useMemo(() => new Set((check?.warnings ?? []).map((i) => i.line).filter((l): l is number => l != null)), [check]);

  const jump = useCallback((line: number) => {
    const t = ta.current;
    if (!t) return;
    const rows = t.value.split('\n');
    const start = rows.slice(0, line - 1).reduce((n, r) => n + r.length + 1, 0);
    t.focus();
    t.setSelectionRange(start, start + (rows[line - 1]?.length ?? 0));
    t.scrollTop = Math.max(0, (line - 3) * LH);
  }, []);

  const validate = async () => {
    setBusy('validate'); setIssues([]); setCheck(null);
    try {
      const r = await put<SaveResult>('/xdepartment/settings', { raw: text, validate_only: true });
      setCheck({ warnings: r.warnings ?? [], normalized: r.normalized_raw ?? null, same: (r.normalized_raw ?? text) === text });
    } catch (e) {
      const list = issuesOf(e);
      if (list.length) setIssues(list); else toast.error('Validation failed', e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  const save = async (reason: string) => {
    setSaving(true);
    try {
      const r = await put<SaveResult>('/xdepartment/settings', { raw: text, reason });
      setBase(r.raw); setText(r.raw); setIssues([]); setCheck({ warnings: r.warnings ?? [], normalized: null, same: true });
      await mutate((prev) => (prev ? { ...prev, raw: r.raw, parsed: r.parsed, version: r.version, updated_at: r.updated_at } : prev), { revalidate: false });
      void swrMutate((k) => Array.isArray(k) && typeof k[0] === 'string' && (k[0] as string).startsWith('/xdepartment/promos'));
      toast.success(`Settings saved · v${r.version}`, 'Live across servers within 15 seconds.');
    } catch (e) {
      if (e instanceof ApiError && issuesOf(e).length) {
        const list = issuesOf(e);
        setIssues(list);
        toast.error('Not saved', `${list.length} problem${list.length > 1 ? 's' : ''} in the document — see the highlighted lines.`);
        if (list[0].line) setTimeout(() => jump(list[0].line!), 0);
      } else throw e;
    } finally { setSaving(false); }
  };

  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) setSaveOpen(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dirty]);

  const p = data?.parsed as { referral_commission_pct?: number; referral_discount_pct?: number; default_discount_pct?: number; min_invoice_usd?: number; promos?: unknown[] } | undefined;

  return (
    <>
      <PageHead title="Platform settings" subtitle={<>Referral commission, discounts and promo codes live in one document. Prices are <b>not</b> editable here. <XTag className="ml-1" /></>}
        actions={data && <span className="flex items-center gap-2 text-xs text-muted"><Badge tone="neutral">v{data.version}</Badge>Updated {dateTime(data.updated_at)}</span>} />

      {error && !data ? <div className="rounded-xl border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} /></div>
        : isLoading && !data ? <Skeleton className="h-[560px] rounded-xl" />
        : (
          <div className="space-y-6">
            {p && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {([['Referral commission', `${p.referral_commission_pct ?? '—'}%`], ['Referral discount', `${p.referral_discount_pct ?? '—'}%`], ['Site-wide discount', `${p.default_discount_pct ?? '—'}%`], ['Invoice floor', `$${p.min_invoice_usd ?? '—'}`], ['Promo codes', String(p.promos?.length ?? 0)]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line bg-panel px-4 py-3"><p className="label">{k}</p><p className="num mt-1 text-lg font-bold">{v}</p></div>
                ))}
              </div>
            )}

            {serverChanged && dirty && (
              <p role="status" className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn"><AlertTriangle className="h-4 w-4 shrink-0" />The saved document changed on the server (for example via a promo edit). Your unsaved text is untouched — saving will overwrite those changes. <button className="ml-auto shrink-0 underline" onClick={() => { setText(data!.raw); setBase(data!.raw); }}>Discard mine &amp; reload</button></p>
            )}

            <Section title="Settings document" actions={
              <div className="flex flex-wrap items-center gap-2">
                {dirty && <Badge tone="warn" dot>Unsaved</Badge>}
                <Button size="xs" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} disabled={!dirty} onClick={() => { setText(base ?? ''); setIssues([]); setCheck(null); }}>Revert</Button>
                <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { if (data) { setText(data.default_raw); setIssues([]); setCheck(null); toast.info('Defaults loaded', 'Not saved yet — review, then save.'); } }}>Reset to defaults</Button>
                <Button size="xs" variant="secondary" icon={<ShieldCheck className="h-3.5 w-3.5" />} loading={busy === 'validate'} onClick={validate}>Validate</Button>
                <Button size="xs" variant="primary" icon={<Save className="h-3.5 w-3.5" />} disabled={!dirty} onClick={() => setSaveOpen(true)}>Save…</Button>
              </div>}>
              <div className="space-y-3 p-4">
                <Editor value={text} onChange={edit} errors={errLines} warnings={warnLines} taRef={ta} />
                <p id="settings-help" className="text-2xs leading-relaxed text-subtle">
                  Line format <code className="font-mono">key = value</code> or raw JSON. Comments start with <code className="font-mono">#</code> or <code className="font-mono">//</code>. Promo: <code className="font-mono">promo = CODE | 10% | plans:all | expires:never | max_uses:0 | active</code>. Press <span className="kbd">Ctrl</span>+<span className="kbd">S</span> to save.
                </p>

                {issues.length > 0 && (
                  <div role="alert" className="rounded-lg border border-down/30 bg-down/10 p-3">
                    <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-down"><AlertTriangle className="h-4 w-4" />{issues.length} problem{issues.length > 1 ? 's' : ''} — nothing was saved</p>
                    <ul className="space-y-1">{issues.map((i, k) => (
                      <li key={k} className="text-sm">{i.line != null ? <button onClick={() => jump(i.line!)} className="mr-2 rounded bg-down/20 px-1.5 py-px font-mono text-xs text-down hover:bg-down/30">Line {i.line}</button> : <span className="mr-2 rounded bg-down/20 px-1.5 py-px font-mono text-xs text-down">Doc</span>}{i.message}</li>))}
                    </ul>
                  </div>
                )}

                {check && issues.length === 0 && (
                  <div role="status" className="rounded-lg border border-up/30 bg-up/10 p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-up"><CheckCircle2 className="h-4 w-4" />Valid. Dry run only — nothing was saved.</p>
                    {check.warnings.length > 0 && <ul className="mt-2 space-y-1 text-warn">{check.warnings.map((w, k) => <li key={k}>{w.line != null && <button onClick={() => jump(w.line!)} className="mr-2 font-mono text-xs underline">Line {w.line}</button>}{w.message}</li>)}</ul>}
                    {check.normalized && !check.same && <p className="mt-2 text-muted">The server would normalise this document. <button className="text-accent underline" onClick={() => { setText(check.normalized!); setCheck(null); }}>Apply normalised version</button></p>}
                  </div>
                )}
              </div>
            </Section>

            <PromoManager />
          </div>
        )}

      <ReasonDialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save platform settings" description="Takes effect on all servers within 15 seconds. The full before/after is written to the audit log." confirmLabel={saving ? 'Saving…' : 'Save settings'} placeholder="e.g. Black Friday promo" onConfirm={save} />
    </>
  );
}
