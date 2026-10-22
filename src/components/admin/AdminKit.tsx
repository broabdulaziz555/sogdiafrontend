'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { ApiError, errMsg } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/components/ui/AuthGate';

/** True for the xdepartment tier (the 🛂 endpoints). */
export function useIsX() {
  return useUser().role === 'xdepartment';
}

/** Small marker shown on controls only the xdepartment tier may use. */
export function XTag({ className }: { className?: string }) {
  return <span title="X-Department only" className={cn('inline-flex items-center gap-1 border border-warn/40 bg-warn/10 px-1 py-px text-2xs font-semibold uppercase tracking-[0.08em] text-warn', className)}><ShieldAlert className="h-3 w-3" />X</span>;
}

/** Runs an async admin action with a busy flag and success/error toasts. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast.success(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      toast.error('Action failed', errMsg(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { busy, run };
}

/** Lines of `details[]` from a VALIDATION_ERROR, if any. */
export function issuesOf(e: unknown): { line: number | null; message: string }[] {
  if (e instanceof ApiError && Array.isArray(e.details)) {
    return (e.details as { line?: number | null; message?: string }[]).map((d) => ({ line: d.line ?? null, message: String(d.message ?? '') }));
  }
  return [];
}

/**
 * Confirmation dialog for destructive or audited actions. Every staff write is written to the audit log,
 * so we ask for a reason up front (required by default).
 */
export function ReasonDialog({
  open, onClose, title, description, confirmLabel = 'Confirm', tone = 'primary', required = true, label = 'Reason', placeholder = 'Shown in the audit log', onConfirm, children,
}: {
  open: boolean; onClose: () => void; title: string; description?: React.ReactNode; confirmLabel?: string; tone?: 'primary' | 'down' | 'up'; required?: boolean; label?: string; placeholder?: string;
  onConfirm: (reason: string) => Promise<unknown>; children?: React.ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bad = required && reason.trim().length < 3;

  const submit = async () => {
    if (bad) return;
    setBusy(true); setErr(null);
    try { await onConfirm(reason.trim()); setReason(''); onClose(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="sm" title={title} description={description}
      footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={tone === 'down' ? 'down' : tone === 'up' ? 'up' : 'primary'} loading={busy} disabled={bad} onClick={submit}>{confirmLabel}</Button></>}>
      <div className="space-y-3 p-5">
        {children}
        <div className="space-y-1">
          <label htmlFor="rd-reason" className="label">{label}{!required && <span className="ml-1 normal-case text-subtle">(optional)</span>}</label>
          <Textarea id="rd-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} maxLength={500} />
          {required && reason.length > 0 && bad && <p className="text-2xs text-down">Give at least a few words.</p>}
        </div>
        {err && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      </div>
    </Modal>
  );
}

export function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className={cn('min-w-0 break-all text-right', mono && 'num font-mono text-xs')}>{v}</dd>
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border border-line bg-panel', className)}>
      <div className="panel-head"><h2 className="panel-title">{title}</h2>{actions}</div>
      {children}
    </section>
  );
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
