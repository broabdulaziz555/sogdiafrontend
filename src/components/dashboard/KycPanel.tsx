'use client';

import { useCallback, useEffect, useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Contact, CreditCard, FileText, ShieldAlert, ShieldCheck, UploadCloud } from 'lucide-react';
import { PageHead } from './PageHead';
import { Button } from '@/components/ui/Button';
import { Panel, PanelHeader, DataRow } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/Primitives';
import { ChoiceGrid, Dropzone, WizardFooter, WizardSteps } from '@/components/ui/Wizard';
import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useApi } from '@/hooks/useApi';
import { errMsg, upload } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { KycStatus } from '@/lib/types';

interface KycStatusResponse { kyc_status: KycStatus; document_url: string | null; note: string | null }
interface UploadResponse { path: string; signed_url: string; expires_in: number; kyc_status: KycStatus }

const SENT_KEY = 'sg-kyc-sent';
const SENT_TTL = 14 * 24 * 3600 * 1000;
interface Sent { name: string; at: number }
const readSent = (): Sent | null => {
  try { const v = JSON.parse(window.localStorage.getItem(SENT_KEY) || 'null') as Sent | null; return v && Date.now() - v.at < SENT_TTL ? v : null; } catch { return null; }
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'application/pdf'];
const DOC_TYPES = [
  { value: 'passport', label: 'Passport', description: 'Photo page', icon: <BookOpen /> },
  { value: 'id_card', label: 'National ID', description: 'Front and back in one file', icon: <CreditCard /> },
  { value: 'driver_license', label: "Driver's licence", description: 'Front and back in one file', icon: <Contact /> },
] as const;
type DocType = (typeof DOC_TYPES)[number]['value'];

const STEPS = [
  { key: 'type', label: 'Document', hint: 'Choose a type' },
  { key: 'upload', label: 'Upload', hint: 'JPG, PNG or PDF' },
  { key: 'review', label: 'Review', hint: 'Confirm & submit' },
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
    <Panel className="p-4">
      <div className="flex items-start gap-4">
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center border border-line2 bg-panel2', cfg.tone)}>{cfg.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{cfg.title}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted">{cfg.body}</p>
          {status === 'rejected' && note && (
            <div className="mt-3 border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
              <span className="font-medium">Reviewer note: </span>{note}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function KycPanel() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<KycStatusResponse>('/kyc/status', undefined, { refreshInterval: (d) => (d?.kyc_status === 'pending' ? 30_000 : 0), revalidateOnFocus: true });
  const [sent, setSent] = useState<Sent | null>(null);
  const [sentNow, setSentNow] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  useEffect(() => { setSent(readSent()); }, []);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>('passport');
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
    setStep((s) => (s > 1 ? 1 : s));
  };

  const submit = async () => {
    if (!file || uploading) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    setProgress(0);
    setUploadError(null);
    try {
      const res = await upload<UploadResponse>('/kyc/upload', fd, setProgress);
      toast.success('Document uploaded', 'Your verification is now pending review.');
      const rec = { name: file.name, at: Date.now() };
      try { window.localStorage.setItem(SENT_KEY, JSON.stringify(rec)); } catch { /* storage blocked */ }
      setSent(rec); setSentNow(true);
      // show "pending" immediately; the server value is re-read in the background and never downgrades this
      await mutate({ kyc_status: res.kyc_status ?? 'pending', document_url: res.path ?? null, note: null }, { revalidate: false });
      globalMutate('/me');
      clear();
      setStep(0);
      setTimeout(() => { void mutate(); }, 2500);
    } catch (e) {
      const msg = errMsg(e);
      setUploadError(msg); // stays on screen next to the button, not just a toast that disappears
      toast.error('Upload failed', msg);
    } finally {
      setProgress(null);
    }
  };

  const server = data?.kyc_status ?? 'not_submitted';
  // The server is the source of truth, but a document we just uploaded (or one it already holds) must never look like "nothing submitted".
  const status: KycStatus =
    server === 'verified' ? 'verified'
    : sentNow && server !== 'pending' ? 'pending'
    : server === 'not_submitted' && (data?.document_url || sent) ? 'pending'
    : server;
  const canUpload = status !== 'verified' && status !== 'pending';
  const docLabel = DOC_TYPES.find((d) => d.value === docType)?.label ?? docType;

  return (
    <>
      <PageHead title="Verification" subtitle="Identity verification (KYC) is required before your first payout." />

      {error && !data ? (
        <div className="border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} title="Could not load verification status" /></div>
      ) : isLoading && !data ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <StatusPanel status={status} note={data?.note ?? null} />
            {status === 'pending' && (sent || data?.document_url) && (
              <div role="status" className="flex items-start gap-3 border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <p><span className="font-medium">Document received</span>{sent ? <> — {sent.name}, sent {new Date(sent.at).toLocaleString()}</> : null}. It is waiting for review; nothing more is needed from you.</p>
              </div>
            )}

            {canUpload ? (
              <Panel aria-labelledby="kyc-upload">
                <PanelHeader title={status === 'rejected' ? 'Resubmit your document' : 'Identity document'} meta={`Step ${step + 1} of ${STEPS.length}`} />
                <div className="border-b border-line px-4 py-4"><WizardSteps steps={STEPS} current={step} /></div>

                <div className="p-4 sm:p-5" id="kyc-upload">
                  {step === 0 && (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">Which document will you upload?</h3>
                        <p className="mt-0.5 text-xs text-muted">Choose the government-issued photo ID you have to hand.</p>
                      </div>
                      <ChoiceGrid value={docType} onChange={setDocType} options={DOC_TYPES.map((d) => ({ ...d }))} />
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">Upload your {docLabel.toLowerCase()}</h3>
                        <p className="mt-0.5 text-xs text-muted">All four corners visible, no glare, text sharp and readable.</p>
                      </div>
                      <Dropzone
                        file={file}
                        preview={preview}
                        error={fileError}
                        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                        hint="JPG, PNG or PDF · up to 5 MB"
                        onFile={pick}
                        onClear={clear}
                        minHeight={260}
                      />
                    </div>
                  )}

                  {step === 2 && file && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold">Review and submit</h3>
                        <p className="mt-0.5 text-xs text-muted">Once submitted, your verification moves to “under review”.</p>
                      </div>
                      <Dropzone file={file} preview={preview} progress={progress} accept="" hint="" onFile={() => {}} onClear={clear} />
                      <dl className="border border-line bg-panel2/40 px-3">
                        <DataRow k="Document type" v={docLabel} />
                        <DataRow k="File" v={file.name} />
                        <DataRow k="Size" v={fmtBytes(file.size)} mono />
                      </dl>
                      {uploadError && <p role="alert" className="border border-down/40 bg-down/10 px-3 py-2 text-sm text-down"><span className="font-medium">Upload failed: </span>{uploadError}</p>}
                    </div>
                  )}
                </div>

                <WizardFooter>
                  {step === 0 ? <span /> : <Button variant="ghost" disabled={uploading} icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setStep(step - 1)}>Back</Button>}
                  {step === 0 && <Button variant="primary" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setStep(1)}>Continue</Button>}
                  {step === 1 && <Button variant="primary" disabled={!file} iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setStep(2)}>Continue</Button>}
                  {step === 2 && <Button variant="primary" disabled={!file} loading={uploading} onClick={submit} icon={<UploadCloud className="h-4 w-4" />}>Submit for review</Button>}
                </WizardFooter>
              </Panel>
            ) : (
              <div className="border border-dashed border-line2 bg-panel/50 px-5 py-6 text-sm text-muted">
                {status === 'pending' ? 'You will be notified as soon as the review is complete. You can still trade in the meantime.' : 'Your identity is verified. Nothing else to do here.'}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <Panel>
              <PanelHeader title="Accepted documents" icon={<ShieldCheck />} />
              <ul className="space-y-3 p-4 text-sm text-muted">
                <li className="flex gap-3"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A valid passport photo page</li>
                <li className="flex gap-3"><CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A national ID card (front and back in one file)</li>
                <li className="flex gap-3"><Contact className="mt-0.5 h-4 w-4 shrink-0 text-accent" />A driver&apos;s licence</li>
              </ul>
            </Panel>
            <Panel>
              <PanelHeader title="Tips for a fast review" />
              <ul className="list-disc space-y-1.5 p-4 pl-8 text-sm text-muted marker:text-subtle">
                <li>All four corners visible, no glare or cropping.</li>
                <li>Text must be sharp and readable.</li>
                <li>The document must not be expired.</li>
                <li>The name must match your account profile.</li>
              </ul>
            </Panel>
            <p className="px-1 text-xs text-subtle">Documents are stored in a private bucket and are only visible to our compliance team.</p>
          </aside>
        </div>
      )}
    </>
  );
}
