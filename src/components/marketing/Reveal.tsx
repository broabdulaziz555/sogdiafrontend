'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/** Fades children up once they enter the viewport. Falls back to visible without IntersectionObserver. */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(shown ? 'animate-fade-up' : 'opacity-0', className)}
    >
      {children}
    </div>
  );
}

export function SectionHead({ eyebrow, title, subtitle, className }: { eyebrow: string; title: string; subtitle?: string; className?: string }) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-accent">
        <span className="h-px w-6 bg-accent" aria-hidden />
        {eyebrow}
      </p>
      <h2 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[44px]">{title}</h2>
      {subtitle && <p className="mt-4 text-md text-muted">{subtitle}</p>}
    </div>
  );
}
