'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { Spinner } from '@/components/ui/States';
import { siteHref } from '@/lib/sites';

const btn = 'inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-fg';
const ghost = 'inline-flex h-10 items-center rounded-md border border-line px-5 text-sm font-semibold hover:border-accent/60';

function Shell({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl card p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  );
}

function SuccessInner() {
  const order = useSearchParams().get('order');
  const { data } = useApi<{ status: string; account_id: string | null }>(
    order ? '/checkout/status' : null,
    { order },
    // Poll until the payment confirms and the account exists (the provider notifies us a few seconds to a few minutes after paying).
    { refreshInterval: (d) => (d?.account_id || d?.status === 'failed' ? 0 : 3_000), dedupingInterval: 0, revalidateOnFocus: true },
  );

  if (data?.account_id) {
    return (
      <Shell icon={<CheckCircle2 className="h-10 w-10 text-up" />} title="Your account is ready" body="Payment confirmed. Your account has been created.">
        <a href={siteHref('app', `/accounts/${data.account_id}`)} className={btn}>Open account</a>
        <a href={siteHref('app', '/')} className={ghost}>Dashboard</a>
      </Shell>
    );
  }
  if (data?.status === 'failed') {
    return (
      <Shell icon={<XCircle className="h-10 w-10 text-down" />} title="Payment was not completed" body="The payment failed or expired. You have not been charged for an account.">
        <Link href="/#pricing" className={btn}>Back to pricing</Link>
      </Shell>
    );
  }
  return (
    <Shell icon={<Clock className="h-10 w-10 text-accent" />} title="Waiting for confirmation" body="We are waiting for the network to confirm your payment. Your account appears automatically, you can leave this page.">
      <Spinner />
      <a href={siteHref('app', '/')} className={ghost}>Go to dashboard</a>
    </Shell>
  );
}

export function CheckoutSuccess() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <Suspense fallback={<Spinner />}><SuccessInner /></Suspense>
    </div>
  );
}

export function CheckoutCancelled() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <Shell icon={<XCircle className="h-10 w-10 text-muted" />} title="Checkout cancelled" body="No payment was made. You can pick a plan again whenever you are ready.">
        <Link href="/#pricing" className={btn}>Back to pricing</Link>
      </Shell>
    </div>
  );
}
