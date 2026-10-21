'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/** Wraps a live number and flashes green/red whenever it ticks up/down. */
export function Flash({ value, children, className, as: Tag = 'span' }: { value: number | null | undefined; children: React.ReactNode; className?: string; as?: 'span' | 'div' }) {
  const ref = useRef<HTMLElement>(null);
  const prev = useRef<number | null | undefined>(value);
  useEffect(() => {
    const el = ref.current;
    const p = prev.current;
    prev.current = value;
    if (!el || value == null || p == null || value === p) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth; // restart the animation
    el.classList.add(value > p ? 'flash-up' : 'flash-down');
  }, [value]);
  const Comp = Tag as any;
  return <Comp ref={ref} className={cn('rounded-sm', className)}>{children}</Comp>;
}
