import { cn } from '@/lib/cn';
import { SOCIAL } from '@/lib/seo';

/** Instagram glyph (outline, follows currentColor like the rest of the icon set). */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** X (formerly Twitter) logo. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.57l11.1 14.43Z" />
    </svg>
  );
}

const LINKS = [
  { name: 'Instagram', href: SOCIAL.instagram, Icon: InstagramIcon },
  { name: 'X', href: SOCIAL.x, Icon: XIcon },
];

/** Official SOGDIA Capital social profiles (@sogdiacapital). */
export function SocialLinks({ className, size = 'md', withHandle }: { className?: string; size?: 'sm' | 'md'; withHandle?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {LINKS.map(({ name, href, Icon }) => (
        <a key={name} href={href} target="_blank" rel="noopener noreferrer me" aria-label={`SOGDIA Capital on ${name} (${SOCIAL.handle})`} title={`${name} · ${SOCIAL.handle}`}
          className={cn('grid place-items-center rounded-xl border border-line bg-panel2/70 text-muted transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-accent', size === 'sm' ? 'h-8 w-8' : 'h-10 w-10')}>
          <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
        </a>
      ))}
      {withHandle && <span className="ml-1 text-sm text-muted">{SOCIAL.handle}</span>}
    </div>
  );
}
