import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { localeDir } from '@/i18n/config';
import { Providers } from '@/components/Providers';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { headers } from 'next/headers';
import './globals.css';

const sans = Inter({ subsets: ['latin', 'cyrillic', 'latin-ext'], variable: '--font-sans', display: 'swap' });

const SITE_LABEL: Record<string, string> = { www: 'SOGDIA', app: 'SOGDIA Dashboard', trade: 'SOGDIA Terminal', xdepartment: 'SOGDIA Admin' };

export async function generateMetadata(): Promise<Metadata> {
  const site = headers().get('x-sg-site') || 'www';
  const label = SITE_LABEL[site] ?? 'SOGDIA';
  return { ...baseMetadata, applicationName: label, appleWebApp: { capable: true, title: label.replace('SOGDIA ', ''), statusBarStyle: 'black-translucent' } };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(`https://www.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site'}`),
  title: { default: 'SOGDIA — Institutional Crypto Prop Firm', template: '%s · SOGDIA' },
  description: 'Trade crypto 24/7. Keep more of what you earn. SOGDIA is built for traders who refuse to wait.',
  applicationName: 'SOGDIA',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // iOS standalone: content draws under the (translucent) status bar — shells pad themselves with env(safe-area-inset-*)
  appleWebApp: { capable: true, title: 'SOGDIA', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-capable': 'yes' },
  openGraph: { title: 'SOGDIA — Institutional Crypto Prop Firm', siteName: 'SOGDIA', type: 'website' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#090C16',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // required for env(safe-area-inset-*) on iOS
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const site = headers().get('x-sg-site') || 'www';
  const messages = await getMessages();

  return (
    <html lang={locale} dir={localeDir(locale)} suppressHydrationWarning className={sans.variable}>
      <head>
        {/* Chrome fires beforeinstallprompt once, often before React has hydrated — catch it immediately so the Install button can use it */}
        <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__sgBip=e;window.dispatchEvent(new Event('sg:bip'))});window.addEventListener('appinstalled',function(){window.__sgBip=null});" }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <RegisterSW />
        <InstallBanner name={SITE_LABEL[site] ?? 'SOGDIA'} />
      </body>
    </html>
  );
}
