import { Nav } from '@/components/marketing/Nav';
import { Footer } from '@/components/marketing/Footer';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
        Skip to content
      </a>
      <Nav />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
