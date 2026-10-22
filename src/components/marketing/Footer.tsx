import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/ui/Logo';

const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || 'SOGDIA';
const EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@sogdia.site';

export function Footer() {
  const t = useTranslations('footer');
  const n = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-line bg-panel2/40">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Logo />
            <p className="max-w-xs text-sm text-muted">{t('tagline')}</p>
          </div>

          <nav aria-label={t('product')}>
            <h3 className="label mb-4">{t('product')}</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link className="hover:text-fg" href="/#rules">{n('rules')}</Link></li>
              <li><Link className="hover:text-fg" href="/#platform">{n('platform')}</Link></li>
              <li><Link className="hover:text-fg" href="/#pricing">{n('pricing')}</Link></li>
              <li><Link className="hover:text-fg" href="/#faq">{n('faq')}</Link></li>
            </ul>
          </nav>

          <nav aria-label={t('legalCol')}>
            <h3 className="label mb-4">{t('legalCol')}</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link className="hover:text-fg" href="/legal#terms">{t('terms')}</Link></li>
              <li><Link className="hover:text-fg" href="/legal#privacy">{t('privacy')}</Link></li>
              <li><Link className="hover:text-fg" href="/legal#risk">{t('risk')}</Link></li>
              <li><Link className="hover:text-fg" href="/legal#execution">Execution &amp; Spread</Link></li>
              <li><Link className="hover:text-fg" href="/legal#payouts">Payout Policy</Link></li>
            </ul>
          </nav>

          <div>
            <h3 className="label mb-4">{t('company')}</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><a className="hover:text-fg" href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 space-y-4 border-t border-line pt-8 text-xs leading-relaxed text-subtle">
          <p>{t('disclaimer')}</p>
          <p>
            SOGDIA accounts are evaluation and funded-trader products priced in USD and paid in cryptocurrency. Fees are non-refundable except
            where required by law. Profit splits, drawdown limits and payout cycles are defined by the rules snapshotted on each account at the
            time of purchase. Trading is conducted within SOGDIA&apos;s own execution engine. Prices are aggregated from liquidity providers, and
            orders are executed at the prevailing quoted bid or ask derived from those prices; a spread of 0.05% is applied against the trader on entry and exit. Market data may be delayed, interrupted or inaccurate.
            Access may be restricted in jurisdictions where the service is prohibited or where sanctions apply. Users are responsible for
            complying with local laws and for any applicable taxes. Payouts are subject to identity verification (KYC), a wallet address on file,
            and review for compliance with the Terms of Service, including prohibitions on latency arbitrage, tick scalping, account sharing and
            other abusive strategies.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-subtle">
            <span>© {year} {ENTITY}. {t('rights')}</span>
            <span className="font-mono">Prices in USD · Payments via NOWPayments</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
