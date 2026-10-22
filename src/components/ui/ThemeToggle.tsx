'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Laptop, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

const OPTS = [
  { v: 'light', icon: Sun, label: 'Light' },
  { v: 'dark', icon: Moon, label: 'Dark' },
  { v: 'system', icon: Laptop, label: 'Auto' },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-xl border border-line bg-panel2/80 p-1', className)}>
      {OPTS.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          role="radio"
          aria-checked={mounted && theme === v}
          aria-label={label}
          title={label}
          onClick={() => setTheme(v)}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-lg transition-colors',
            mounted && theme === v ? 'bg-panel text-accent ring-1 ring-line' : 'text-subtle hover:text-fg',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
