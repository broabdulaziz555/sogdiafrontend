import { Hero } from '@/components/marketing/Hero';
import { LiveTicker } from '@/components/marketing/LiveTicker';
import { HowItWorks, Rules, Platform, FinalCta } from '@/components/marketing/Sections';
import { Pricing } from '@/components/marketing/Pricing';
import { FAQ } from '@/components/marketing/FAQ';
import { getLocale, getTranslations } from 'next-intl/server';
import { hreflang } from '@/lib/seo';

/** FAQPage structured data in the visitor's language, so the answers can appear as rich results. */
async function FaqJsonLd() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'faq' });
  const n = [1, 2, 3, 4, 5, 6].filter((i) => t.has(`q${i}`) && t.has(`a${i}`));
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: hreflang(locale),
    mainEntity: n.map((i) => ({ '@type': 'Question', name: t(`q${i}`), acceptedAnswer: { '@type': 'Answer', text: t(`a${i}`) } })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />;
}

export default function LandingPage() {
  return (
    <>
      <FaqJsonLd />
      <Hero />
      <LiveTicker />
      <HowItWorks />
      <Rules />
      <Platform />
      <Pricing />
      <FAQ />
      <FinalCta />
    </>
  );
}
