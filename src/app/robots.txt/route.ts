import { SITE_URL } from '@/lib/seo';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sogdia.site';

/** GET /robots.txt — only the public site (www / apex) is crawlable; app, trade and xdepartment are private. */
export function GET(req: Request) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  const publicHost = host === ROOT || host === `www.${ROOT}` || !host.endsWith(ROOT);
  const body = publicHost
    ? ['User-agent: *', 'Allow: /', 'Disallow: /checkout', 'Disallow: /login', '', `Sitemap: ${SITE_URL}/sitemap.xml`, `Host: ${SITE_URL.replace('https://', '')}`, ''].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
