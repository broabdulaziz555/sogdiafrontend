'use client';

import { useEffect, useState } from 'react';
import { prodHref, siteHref, type Site } from '@/lib/sites';

/**
 * Cross-site anchor. Renders the production URL during SSR, then upgrades to the
 * environment-correct URL (subdomain in prod, ?site= on localhost) after mount.
 */
export function SiteLink({ site, path = '/', children, ...rest }: { site: Site; path?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const [href, setHref] = useState(() => prodHref(site, path));
  useEffect(() => setHref(siteHref(site, path)), [site, path]);
  return <a href={href} {...rest}>{children}</a>;
}

export function useSiteHref() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (site: Site, path = '/') => (ready ? siteHref(site, path) : prodHref(site, path));
}
