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
  primary: 'border border-accent bg-accent font-semibold text-accent-fg hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-line bg-panel2 text-fg hover:border-line2 hover:bg-fg/[0.04] active:bg-fg/[0.07]',
  outline: 'border border-line2 bg-transparent text-fg hover:border-accent hover:text-accent',
  ghost: 'border border-transparent text-muted hover:bg-fg/[0.06] hover:text-fg active:bg-fg/[0.09]',
  danger: 'border border-down/40 bg-down/10 text-down hover:bg-down/20 active:bg-down/25',
  up: 'border border-up bg-up font-semibold text-black hover:brightness-110 active:brightness-95',
  down: 'border border-down bg-down font-semibold text-white hover:brightness-110 active:brightness-95',
};

const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3.5 text-sm gap-2',
  lg: 'h-10 px-5 text-base gap-2 font-semibold',
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
        'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors duration-100',
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
