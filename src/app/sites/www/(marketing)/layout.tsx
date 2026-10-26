import { getLocale, getTranslations } from 'next-intl/server';
import { Nav } from '@/components/marketing/Nav';
import { hreflang, organizationJsonLd } from '@/lib/seo';
import { Footer } from '@/components/marketing/Footer';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'seo' });
  const ld = organizationJsonLd(t('description'), hreflang(locale));
  return (
    <div className="flex min-h-dvh flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
