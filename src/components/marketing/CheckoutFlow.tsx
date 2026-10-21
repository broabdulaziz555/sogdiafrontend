'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, BadgeCheck, Lock, ShieldCheck, Ticket, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Badge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useHasSession } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { usePricing } from '@/hooks/usePricing';
import { ApiError, errMsg, post } from '@/lib/api';
import { fmtSize, fmtUsd } from '@/lib/format';
import type { CheckoutResponse, PromoValidation } from '@/lib/types';
import { cn } from '@/lib/cn';

const CURRENCIES = [
  { v: '', label: 'Choose on invoice page' },
  { v: 'usdttrc20', label: 'USDT · TRC20' },
  { v: 'usdterc20', label: 'USDT · ERC20' },
  { v: 'usdtbsc', label: 'USDT · BEP20' },
  { v: 'btc', label: 'Bitcoin' },
  { v: 'eth', label: 'Ethereum' },
  { v: 'sol', label: 'Solana' },
  { v: 'ltc', label: 'Litecoin' },
];

function Inner() {
  const t = useTranslations('checkout');
  const c = useTranslations('common');
  const toast = useToast();
  const params = useSearchParams();
  const planKey = params.get('plan');
  const has = useHasSession();
  const { pricing, loading: pricingLoading } = usePricing();
  const plan = pricing.plans.find((p) => p.key === planKey);

  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [currency, setCurrency] = useState('usdttrc20');
  const [busy, setBusy] = useState(false);
  const idem = useRef<string>('');
  const [promoErr, setPromoErr] = useState<string | null>(null);

  // Stable idempotency key per (plan, code, currency) attempt so double-clicks replay, not duplicate.
  useEffect(() => { idem.current = crypto.randomUUID(); }, [planKey, appliedCode, currency]);

  const { data: preview, error, isLoading, mutate } = useApi<PromoValidation>(
    has && plan ? '/promos/validate' : null,
    { plan_key: plan?.key, code: appliedCode ?? undefined },
  );

  useEffect(() => {
    if (!preview || !appliedCode) return;
    if (!preview.valid) {
      setPromoErr(preview.message ?? preview.reason ?? 'Promo code is not valid.');
      setAppliedCode(null);
    } else setPromoErr(null);
  }, [preview, appliedCode]);

  const quote = preview?.quote;
  const list = quote?.list_price ?? plan?.price ?? 0;
  const final = quote?.final_price ?? plan?.effective_price ?? 0;
  const discount = quote?.discount ?? Math.max(0, list - final);

  const next = useMemo(() => (typeof window === 'undefined' ? '' : encodeURIComponent(`/checkout?plan=${planKey ?? ''}`)), [planKey]);

  const pay = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await post<CheckoutResponse>(
        '/checkout',
        { plan_key: plan.key, ...(currency && { pay_currency: currency }), ...(appliedCode && { promo_code: appliedCode }) },
        { headers: { 'Idempotency-Key': idem.current } },
      );
      window.location.href = res.invoice_url;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        const reason = (e.details as { reason?: string } | null)?.reason;
        setPromoErr(reason ? `${e.message} (${reason})` : e.message);
        setAppliedCode(null);
      }
      toast.error('Checkout failed', errMsg(e));
      setBusy(false);
    }
  };

  if (!planKey || (!pricingLoading && !plan)) {
    return (
      <EmptyState
        title={t('noPlan')}
        description={t('noPlanBody')}
        action={<Link href="/#pricing" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg">View pricing</Link>}
      />
    );
  }

  if (has === false) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-panel p-8 text-center">
        <Lock className="mx-auto mb-4 h-8 w-8 text-accent" />
        <h2 className="text-xl font-semibold">{t('signInFirst')}</h2>
        <p className="mt-2 text-sm text-muted">{t('signInBody')}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href={`/login?next=${next}`} className="grid h-10 place-items-center rounded-md border border-line text-sm font-semibold hover:border-accent/60">{c('signIn')}</Link>
          <Link href={`/register?next=${next}`} className="grid h-10 place-items-center rounded-md bg-accent text-sm font-semibold text-accent-fg">{c('signUp')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      {/* Left: details */}
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-panel p-6">
          <p className="label mb-4">{t('plan')}</p>
          {plan ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{plan.type === 'one_step' ? 'One-Step' : 'Instant'} {fmtSize(plan.size)}</h2>
                <p className="mt-1 text-sm text-muted">
                  {plan.profit_target_pct != null ? `${plan.profit_target_pct}% target · ` : 'No profit target · '}
                  {plan.daily_dd_pct}% daily DD · {plan.max_dd_pct}% max DD · {plan.max_leverage}× · {plan.payout_split_pct}% split
                </p>
              </div>
              <Badge tone="accent">{plan.type === 'one_step' ? 'Evaluation' : 'Funded'}</Badge>
            </div>
          ) : (
            <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-80" /></div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-6">
          <Field label={t('promoLabel')} error={promoErr} hint={appliedCode ? undefined : t('bestOnly')} htmlFor="promo">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <Input
                  id="promo"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder={t('promoPlaceholder')}
                  className="pl-9 font-mono uppercase"
                  maxLength={24}
                  disabled={!!appliedCode}
                  onKeyDown={(e) => { if (e.key === 'Enter' && codeInput) { e.preventDefault(); setPromoErr(null); setAppliedCode(codeInput.trim()); } }}
                />
              </div>
              {appliedCode ? (
                <Button onClick={() => { setAppliedCode(null); setCodeInput(''); setPromoErr(null); }} icon={<X className="h-3.5 w-3.5" />}>{t('remove')}</Button>
              ) : (
                <Button onClick={() => { setPromoErr(null); setAppliedCode(codeInput.trim()); }} disabled={!codeInput.trim()}>{t('apply')}</Button>
              )}
            </div>
          </Field>
          {appliedCode && preview?.valid && (
            <p className="mt-3 flex items-center gap-2 text-sm text-up"><BadgeCheck className="h-4 w-4" />{t('promoApplied')}: <span className="font-mono font-semibold">{preview.promo_code}</span></p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-panel p-6">
          <Field label={t('payCurrency')} htmlFor="cur">
            <Select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </Select>
          </Field>
        </section>
      </div>

      {/* Right: summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-panel">
          <div className="border-b border-line bg-panel2 px-6 py-4"><h2 className="text-md font-semibold">{t('title')}</h2></div>
          <div className="space-y-3 p-6 text-sm">
            {error && !preview ? (
              <ErrorState error={error} onRetry={() => mutate()} compact />
            ) : isLoading && !preview ? (
              <><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="mt-4 h-8" /></>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted">{t('listPrice')}</span><span className="num font-mono">{fmtUsd(list)}</span></div>
                <div className={cn('flex justify-between', discount > 0 ? 'text-up' : 'text-muted')}>
                  <span>{t('discount')}{quote?.label && discount > 0 ? ` · ${quote.label}` : ''}</span>
                  <span className="num font-mono">{discount > 0 ? `−${fmtUsd(discount)}` : fmtUsd(0)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-4">
                  <span className="font-medium">{t('total')}</span>
                  <span className="num text-3xl font-extrabold tracking-tight text-accent">{fmtUsd(final)}</span>
                </div>
              </>
            )}
          </div>
          <div className="space-y-4 border-t border-line bg-panel2/50 p-6">
            <Button variant="primary" size="lg" block loading={busy} disabled={!plan || isLoading} onClick={pay}>
              {busy ? t('redirecting') : t('pay', { amount: fmtUsd(final) })}
            </Button>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-subtle"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('secureNote')}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function CheckoutFlow() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
      <Link href="/#pricing" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Pricing</Link>
      <Suspense fallback={<Skeleton className="h-64" />}><Inner /></Suspense>
    </div>
  );
}
