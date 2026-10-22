import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/ui/Logo';
import { EXECUTION_PATH, TRADING_FOOTER } from '@/lib/legal';

const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || 'SOGDIA';
const EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@sogdia.site';

export function Footer() {
  const t = useTranslations('footer');
  const n = useTranslations('nav');
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-line bg-panel2/60">
      <div className="mx-auto max-w-7xl px-4 py-12 pb-safe sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
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
              <li><Link className="hover:text-fg" href={EXECUTION_PATH}>Execution &amp; Spread</Link></li>
            </ul>
          </nav>

          <div>
            <h3 className="label mb-4">{t('company')}</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><a className="hover:text-fg" href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 space-y-4 border-t border-line pt-6 text-xs leading-relaxed text-subtle">
          <p>
            {TRADING_FOOTER}{' '}
            <Link href={EXECUTION_PATH} className="text-muted underline hover:text-fg">Execution Disclosure</Link>
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
