'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Reveal, SectionHead } from './Reveal';
import { cn } from '@/lib/cn';

function Item({ q, a, open, onToggle, index }: { q: string; a: string; open: boolean; onToggle: () => void; index: number }) {
  const id = useId();
  const inner = useRef<HTMLDivElement>(null);

  return (
    <div className={cn('group rounded-xl border transition-colors duration-300', open ? 'border-accent/40 bg-panel' : 'border-line bg-panel/50 hover:border-subtle/50')}>
      <h3>
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          className="flex w-full items-center gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
        >
          <span className={cn('num font-mono text-xs transition-colors', open ? 'text-accent' : 'text-subtle')}>{String(index + 1).padStart(2, '0')}</span>
          <span className={cn('flex-1 text-md font-semibold transition-colors', open ? 'text-fg' : 'text-fg/90')}>{q}</span>
          <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-all duration-300', open ? 'rotate-45 border-accent bg-accent text-accent-fg' : 'border-line text-muted group-hover:text-fg')}>
            <Plus className="h-4 w-4" />
          </span>
        </button>
      </h3>
      {/* grid-rows trick → smooth height transition without measuring */}
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-btn`}
        className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
      >
        <div ref={inner} className="overflow-hidden">
          <p className="px-5 pb-5 pl-[3.25rem] pr-8 text-sm leading-relaxed text-muted sm:px-6 sm:pb-6 sm:pl-[4.25rem]">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const t = useTranslations('faq');
  const [open, setOpen] = useState<number | null>(0);
  const items = [1, 2, 3, 4, 5, 6].map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));

  return (
    <section id="faq" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <Reveal><SectionHead eyebrow={t('eyebrow')} title={t('title')} /></Reveal>
        <div className="space-y-3">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 40}>
              <Item q={it.q} a={it.a} index={i} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
