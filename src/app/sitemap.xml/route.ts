import { DEFAULT_LOCALE, LOCALE_CODES } from '@/i18n/config';
import { INDEXABLE_PATHS, hreflang, localizedUrl } from '@/lib/seo';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * GET /sitemap.xml — every public page in every language (English first, then Russian, then the rest), each entry
 * carrying the full set of hreflang alternates so search engines pair the translations.
 */
export function GET() {
  const order = [DEFAULT_LOCALE, 'ru', ...LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE && c !== 'ru')];
  const today = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];
  for (const path of INDEXABLE_PATHS) {
    const alts = [...LOCALE_CODES.map((c) => `    <xhtml:link rel="alternate" hreflang="${hreflang(c)}" href="${esc(localizedUrl(path, c))}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(localizedUrl(path, DEFAULT_LOCALE))}"/>`].join('\n');
    for (const code of order) {
      const priority = path === '/' ? (code === DEFAULT_LOCALE ? '1.0' : code === 'ru' ? '0.9' : '0.8') : '0.5';
      urls.push(`  <url>\n    <loc>${esc(localizedUrl(path, code))}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${path === '/' ? 'daily' : 'monthly'}</changefreq>\n    <priority>${priority}</priority>\n${alts}\n  </url>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
