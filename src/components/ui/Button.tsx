'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'up' | 'down' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-accent to-[rgb(154_226_84)] font-semibold text-accent-fg shadow-btn hover:brightness-105 active:brightness-95',
  secondary: 'border border-line bg-panel2 text-fg hover:border-line2 hover:bg-[rgb(var(--line)/0.55)] active:bg-line',
  outline: 'border border-line2 bg-transparent text-fg hover:border-accent/70 hover:bg-accent/[0.06] hover:text-accent',
  ghost: 'text-muted hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.1]',
  danger: 'border border-down/30 bg-down/10 text-down hover:bg-down/[0.18] active:bg-down/25',
  up: 'bg-gradient-to-b from-[rgb(58_226_165)] to-up font-semibold text-[#04140D] shadow-[0_8px_20px_-10px_rgb(var(--up)/0.7)] hover:brightness-105 active:brightness-95',
  down: 'bg-gradient-to-b from-[rgb(255_117_135)] to-down font-semibold text-white shadow-[0_8px_20px_-10px_rgb(var(--down)/0.7)] hover:brightness-105 active:brightness-95',
};

const sizes: Record<Size, string> = {
  xs: 'h-7 rounded-lg px-2.5 text-xs gap-1',
  sm: 'h-8 rounded-lg px-3 text-xs gap-1.5',
  md: 'h-10 rounded-xl px-4 text-sm gap-2',
  lg: 'h-12 rounded-xl px-6 text-md gap-2 font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition duration-150 active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});
