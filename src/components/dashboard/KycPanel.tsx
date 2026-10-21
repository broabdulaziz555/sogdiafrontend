'use client';

import { useCallback, useRef, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { CheckCircle2, Clock, FileCheck2, FileText, BookOpen, Contact, ShieldAlert, UploadCloud, X } from 'lucide-react';
import { PageHead } from './PageHead';
import { Button } from '@/components/ui/Button';
import { Select, Field, StatusBadge } from '@/components/ui/Primitives';
import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useApi } from '@/hooks/useApi';
import { errMsg, upload } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { KycStatus } from '@/lib/types';

interface KycStatusResponse { kyc_status: KycStatus; document_url: string | null; note: string | null }
interface UploadResponse { path: string; signed_url: string; expires_in: number; kyc_status: KycStatus }

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'application/pdf'];
const DOC_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'id_card', label: 'National ID card' },
  { value: 'driver_license', label: "Driver's licence" },
];

function validate(f: File): string | null {
  if (!ACCEPT.includes(f.type)) return 'Unsupported file type. Use JPG, PNG or PDF.';
  if (f.size > MAX_BYTES) return `File is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`;
  if (f.size === 0) return 'This file is empty.';
  return null;
}

const fmtBytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function StatusPanel({ status, note }: { status: KycStatus; note: string | null }) {
  const cfg = {
    not_submitted: { icon: <FileText className="h-5 w-5" />, tone: 'text-muted', title: 'Verification required', body: 'Upload a government-issued photo ID to unlock payouts. It takes about a minute.' },
    pending: { icon: <Clock className="h-5 w-5" />, tone: 'text-warn', title: 'Under review', body: 'Your document is with our compliance team. Reviews are usually completed within one business day.' },
    verified: { icon: <CheckCircle2 className="h-5 w-5" />, tone: 'text-up', title: 'Identity verified', body: 'You are cleared to request payouts. No further action is needed.' },
    rejected: { icon: <ShieldAlert className="h-5 w-5" />, tone: 'text-down', title: 'Verification rejected', body: 'We could not accept your document. Review the note below and upload a new one.' },
  }[status];
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start gap-4">
        <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel2', cfg.tone)}>{cfg.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">{cfg.title}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted">{cfg.body}</p>
          {status === 'rejected' && note && (
            <div className="mt-3 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">
              <span className="font-medium">Reviewer note: </span>{note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KycPanel() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<KycStatusResponse>('/kyc/status');
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('passport');
  const [fileError, setFileError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;

  const pick = useCallback((f: File | undefined | null) => {
    if (!f) return;
    const err = validate(f);
    setFileError(err);
    if (preview) URL.revokeObjectURL(preview);
    if (err) { setFile(null); setPreview(null); return; }
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  }, [preview]);

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async () => {
    if (!file || uploading) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    setProgress(0);
    try {
      const res = await upload<UploadResponse>('/kyc/upload', fd, setProgress);
      toast.success('Document uploaded', 'Your verification is now pending review.');
      await mutate({ kyc_status: res.kyc_status, document_url: res.path, note: null }, { revalidate: true });
      globalMutate('/me');
      clear();
    } catch (e) {
      toast.error('Upload failed', errMsg(e));
    } finally {
      setProgress(null);
    }
  };

  const status = data?.kyc_status ?? 'not_submitted';
  const canUpload = status !== 'verified' && status !== 'pending';

  return (
    <>
      <PageHead title="Verification" subtitle="Identity verification (KYC) is required before your first payout." />

      {error && !data ? (
        <div className="rounded-2xl border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} title="Could not load verification status" /></div>
      ) : isLoading && !data ? (
        <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <StatusPanel status={status} note={data?.note ?? null} />

            {canUpload ? (
              <section className="rounded-2xl border border-line bg-panel p-5" aria-labelledby="kyc-upload">
                <h2 id="kyc-upload" className="text-md font-semibold">{status === 'rejected' ? 'Upload a new document' : 'Upload your document'}</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
                  <Field label="Document type" htmlFor="doc_type">
                    <Select id="doc_type" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={uploading}>
                      {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </Select>
                  </Field>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Choose a file or drag and drop it here"
                  onClick={() => !uploading && inputRef.current?.click()}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); if (!uploading) pick(e.dataTransfer.files?.[0]); }}
                  className={cn(
                    'mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all',
                    drag ? 'border-accent bg-accent/10 shadow-glow' : 'border-line bg-panel2/50 hover:border-accent/50 hover:bg-panel2',
                    fileError && 'border-down/60',
                    uploading && 'pointer-events-none opacity-70',
                  )}
                >
                  <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={(e) => pick(e.target.files?.[0])} />
                  <span className={cn('grid h-12 w-12 place-items-center rounded-xl border border-line bg-panel text-subtle transition-colors', drag && 'border-accent/50 text-accent')}>
                    <UploadCloud className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium">{drag ? 'Drop to upload' : 'Drag & drop your document, or click to browse'}</p>
                  <p className="text-xs text-subtle">JPG, PNG or PDF · up to 5 MB</p>
                </div>
                {fileError && <p role="alert" className="mt-2 text-sm text-down">{fileError}</p>}

                {file && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel2 p-3">
                    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {preview ? <img src={preview} alt="Selected document preview" className="h-full w-full object-cover" /> : <FileCheck2 className="h-6 w-6 text-subtle" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-subtle">{fmtBytes(file.size)}</p>
                      {uploading && (
                        <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
                          <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
                          <p className="mt-1 text-2xs text-muted">{progress}%</p>
                        </div>
                      )}
                    </div>
                    {!uploading && <button onClick={clear} aria-label="Remove file" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-fg/10 hover:text-fg"><X className="h-4 w-4" /></button>}
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <Button variant="primary" size="md" disabled={!file} loading={uploading} onClick={submit} icon={<UploadCloud className="h-4 w-4" />}>Submit for review</Button>
                </div>
              </section>
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-panel/50 px-5 py-6 text-sm text-muted">
                {status === 'pending' ? 'You will be notified as soon as the review is complete. You can still trade in the meantime.' : 'Your identity is verified. Nothing else to do here.'}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-panel p-5">
              <h3 className="text-sm font-semibold">What we accept</h3>
              <ul className="mt-3 space-y-3 text-sm text-muted">
                <li className="flex gap-3"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A valid passport photo page</li>
                <li className="flex gap-3"><Contact className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A national ID card (front and back in one file)</li>
                <li className="flex gap-3"><Contact className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A driver&apos;s licence</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-5">
              <h3 className="text-sm font-semibold">Tips for a fast review</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-muted marker:text-subtle">
                <li>All four corners visible, no glare or cropping.</li>
                <li>Text must be sharp and readable.</li>
                <li>The document must not be expired.</li>
                <li>The name must match your account profile.</li>
              </ul>
            </div>
            <p className="px-1 text-xs text-subtle">Documents are stored in a private bucket and are only visible to our compliance team.</p>
          </aside>
        </div>
      )}
    </>
  );
}
