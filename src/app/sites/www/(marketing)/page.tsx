import { Hero } from '@/components/marketing/Hero';
import { LiveTicker } from '@/components/marketing/LiveTicker';
import { HowItWorks, Rules, Platform, FinalCta } from '@/components/marketing/Sections';
import { Pricing } from '@/components/marketing/Pricing';
import { FAQ } from '@/components/marketing/FAQ';

export default function LandingPage() {
  return (
    <>
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
