import { mkdirSync, writeFileSync } from 'node:fs';
import createNextIntlPlugin from 'next-intl/plugin';

// Which build is this? Render sets RENDER_GIT_COMMIT. The same id is compiled into the app and written to
// public/version.json, so a running app can tell when a newer build has been deployed.
const BUILD_ID = (process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
try {
  mkdirSync('public', { recursive: true });
  writeFileSync('public/version.json', JSON.stringify({ id: BUILD_ID }));
} catch { /* read-only checkout: the app simply skips update checks */ }

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Set API_PROXY_TARGET (e.g. https://api.sogdia.site) to proxy /api/* to the
// backend. Leave it empty when the backend is served from the same origin.
const apiTarget = process.env.API_PROXY_TARGET;

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  experimental: { optimizePackageImports: ['lucide-react'] },
  poweredByHeader: false,
  async rewrites() {
    return apiTarget
      ? [{ source: '/api/:path*', destination: `${apiTarget.replace(/\/$/, '')}/api/:path*` }]
      : [];
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
