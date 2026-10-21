import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { localeDir } from '@/i18n/config';
import { Providers } from '@/components/Providers';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import './globals.css';

const sans = Inter({ subsets: ['latin', 'cyrillic', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(`https://www.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site'}`),
  title: { default: 'SOGDIA — Institutional Crypto Prop Firm', template: '%s · SOGDIA' },
  description: 'Trade crypto 24/7. Keep more of what you earn. SOGDIA is built for traders who refuse to wait.',
  applicationName: 'SOGDIA',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'SOGDIA', statusBarStyle: 'black-translucent' },
  openGraph: { title: 'SOGDIA — Institutional Crypto Prop Firm', siteName: 'SOGDIA', type: 'website' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080C12' },
    { media: '(prefers-color-scheme: light)', color: '#F4F6F9' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={localeDir(locale)} suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
