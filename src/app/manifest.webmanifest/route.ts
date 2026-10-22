import { NextRequest, NextResponse } from 'next/server';

/**
 * One web-app manifest per subdomain, so www / app / trade / xdepartment each install as their own app
 * (own name, own home screen icon label, own start page). Served dynamically from the Host header.
 */
export const dynamic = 'force-dynamic';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site';

interface Def { name: string; short: string; description: string; shortcuts?: { name: string; url: string }[] }

const DEFS: Record<string, Def> = {
  www: { name: 'SOGDIA — Institutional Crypto Prop Firm', short: 'SOGDIA', description: 'Trade crypto 24/7. Keep more of what you earn.' },
  app: {
    name: 'SOGDIA — Trader Dashboard', short: 'SOGDIA', description: 'Accounts, payouts, KYC, certificates and your PnL calendar.',
    shortcuts: [{ name: 'Accounts', url: '/' }, { name: 'PnL calendar', url: '/calendar' }, { name: 'Payouts', url: '/payouts' }, { name: 'Verification', url: '/kyc' }],
  },
  trade: { name: 'SOGDIA Terminal', short: 'Terminal', description: 'Professional crypto trading terminal for SOGDIA funded accounts.' },
  xdepartment: {
    name: 'SOGDIA Admin', short: 'Admin', description: 'SOGDIA staff console.',
    shortcuts: [{ name: 'KYC review', url: '/kyc' }, { name: 'Payout queue', url: '/payouts' }, { name: 'Users', url: '/users' }],
  },
};

/** Surface colour of the installed app's window chrome / splash screen. Matches --bg in globals.css. */
const THEME = '#080C12';

function siteOf(req: NextRequest): string {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host === ROOT) return 'www';
  if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    return sub in DEFS ? sub : 'www';
  }
  const c = req.cookies.get('sg_site')?.value; // local development: ?site=trade is remembered in this cookie
  return c && c in DEFS ? c : 'www';
}

export function GET(req: NextRequest) {
  const site = siteOf(req);
  const d = DEFS[site];
  const body = {
    name: d.name,
    short_name: d.short,
    description: d.description,
    id: `/?app=${site}`,
    start_url: '/',
    scope: '/',
    display: 'standalone', // no browser chrome — launches like a native app
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any', // the terminal is used in landscape on tablets
    background_color: THEME,
    theme_color: THEME,
    launch_handler: { client_mode: 'navigate-existing' }, // re-opening focuses the running window instead of spawning another
    lang: 'en',
    dir: 'ltr',
    categories: ['finance', 'business'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    ...(d.shortcuts ? { shortcuts: d.shortcuts.map((s) => ({ name: s.name, short_name: s.name, url: s.url, icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] })) } : {}),
  };
  return new NextResponse(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      Vary: 'Host, Cookie',
    },
  });
}
