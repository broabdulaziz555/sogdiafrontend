'use client';

import { useCallback, useRef, useState } from 'react';
import { Check, FileCheck2, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Stepper ───────────────────────────────────────────────────────────── */
export interface WizardStep { key: string; label: string; hint?: string }

/** Horizontal step indicator: numbered squares joined by hairlines. Completed steps are lime with a check. */
export function WizardSteps({ steps, current, className }: { steps: WizardStep[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex items-stretch', className)} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center" aria-current={active ? 'step' : undefined}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'num grid h-6 w-6 shrink-0 place-items-center border font-mono text-2xs font-semibold transition-colors',
                  done && 'border-accent bg-accent text-accent-fg',
                  active && 'border-accent text-accent',
                  !done && !active && 'border-line2 text-subtle',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn('block truncate text-xs font-medium', active || done ? 'text-fg' : 'text-subtle')}>{s.label}</span>
                {s.hint && <span className="hidden truncate text-2xs text-subtle sm:block">{s.hint}</span>}
              </span>
            </div>
            {i < steps.length - 1 && <span className={cn('mx-3 h-px min-w-[12px] flex-1', done ? 'bg-accent/70' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Sticky-looking action bar for the bottom of a wizard body. */
export function WizardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-2 border-t border-line bg-panel2/60 px-4 py-3', className)}>{children}</div>;
}

/* ── Dropzone ──────────────────────────────────────────────────────────── */
const fmtBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Large drag-and-drop target. Pure UI: validation is delegated to `onFile` (return an error string to reject).
 * Corner ticks give it a "scanner viewfinder" feel and make the target obvious on dark surfaces.
 */
export function Dropzone({
  file, preview, error, disabled, progress, accept, hint, onFile, onClear, className, minHeight = 240,
}: {
  file: File | null;
  preview?: string | null;
  error?: string | null;
  disabled?: boolean;
  progress?: number | null;
  accept: string;
  hint: string;
  onFile: (f: File | undefined | null) => void;
  onClear: () => void;
  className?: string;
  minHeight?: number;
}) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = useCallback(() => { if (!disabled) input.current?.click(); }, [disabled]);
  const uploading = progress != null;

  if (file) {
    return (
      <div className={cn('border border-line bg-panel2/60', className)}>
        <div className="flex items-center gap-4 p-4">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden border border-line bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="Selected document preview" className="h-full w-full object-cover" /> : <FileCheck2 className="h-8 w-8 text-subtle" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="num mt-0.5 font-mono text-xs text-subtle">{fmtBytes(file.size)} · {file.type || 'file'}</p>
            {uploading && (
              <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
                <div className="h-1 bg-line"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
                <p className="num mt-1 font-mono text-2xs text-muted">Uploading {progress}%</p>
              </div>
            )}
          </div>
          {!uploading && (
            <button onClick={onClear} aria-label="Remove file" className="grid h-8 w-8 place-items-center border border-line text-muted transition-colors hover:border-line2 hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a file or drag and drop it here"
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) onFile(e.dataTransfer.files?.[0]); }}
        style={{ minHeight }}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-6 py-10 text-center transition-colors',
          drag ? 'border-accent bg-accent/[0.07]' : 'border-line2 bg-panel2/40 hover:border-accent/60 hover:bg-panel2/70',
          error && 'border-down/60',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {/* corner ticks */}
        {['left-1.5 top-1.5 border-l border-t', 'right-1.5 top-1.5 border-r border-t', 'bottom-1.5 left-1.5 border-b border-l', 'bottom-1.5 right-1.5 border-b border-r'].map((c) => (
          <span key={c} aria-hidden className={cn('absolute h-2.5 w-2.5 border-accent/70 transition-opacity', c, drag ? 'opacity-100' : 'opacity-50 group-hover:opacity-100')} />
        ))}
        <input ref={input} type="file" className="sr-only" tabIndex={-1} accept={accept} onChange={(e) => onFile(e.target.files?.[0])} />
        <span className={cn('grid h-12 w-12 place-items-center border border-line2 bg-panel text-subtle transition-colors', drag && 'border-accent text-accent', 'group-hover:text-accent')}>
          <UploadCloud className="h-6 w-6" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-sm font-medium">{drag ? 'Release to upload' : <>Drag &amp; drop your document, or <span className="text-accent underline decoration-accent/40 underline-offset-2">browse</span></>}</p>
          <p className="mt-1 text-xs text-subtle">{hint}</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-down">{error}</p>}
    </div>
  );
}

/** Radio-card group used for single choices inside wizards (document type, network, …). */
export function ChoiceGrid<T extends string>({ value, onChange, options, disabled, className }: {
  value: T; onChange: (v: T) => void; disabled?: boolean; className?: string;
  options: { value: T; label: string; description?: string; icon?: React.ReactNode }[];
}) {
  return (
    <div role="radiogroup" className={cn('grid gap-2 sm:grid-cols-3', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex flex-col items-start gap-2 border p-3 text-left transition-colors disabled:opacity-60',
              on ? 'border-accent bg-accent/[0.06]' : 'border-line bg-panel2/40 hover:border-line2',
            )}
          >
            <span className={cn('[&>svg]:h-5 [&>svg]:w-5', on ? 'text-accent' : 'text-subtle')}>{o.icon}</span>
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-2xs text-subtle">{o.description}</span>}
            </span>
            <span aria-hidden className={cn('absolute right-2 top-2 grid h-4 w-4 place-items-center border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line2')}>
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
