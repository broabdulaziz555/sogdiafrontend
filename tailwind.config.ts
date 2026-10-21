import type { Config } from 'tailwindcss';

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        panel: c('panel'),
        panel2: c('panel2'),
        line: c('line'),
        fg: c('fg'),
        muted: c('muted'),
        subtle: c('subtle'),
        accent: c('accent'),
        'accent-fg': c('accent-fg'),
        up: c('up'),
        down: c('down'),
        warn: c('warn'),
        info: c('info'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
        md: ['14px', '22px'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 12px 48px -12px rgb(var(--accent) / 0.35)',
        panel: '0 1px 0 0 rgb(255 255 255 / 0.02) inset, 0 8px 24px -12px rgb(0 0 0 / 0.5)',
        pop: '0 16px 48px -12px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(var(--line))',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        slideLeft: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fadeUp .5s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fadeIn .2s ease-out both',
        'scale-in': 'scaleIn .16s cubic-bezier(.2,.7,.2,1) both',
        'slide-left': 'slideLeft .22s cubic-bezier(.2,.7,.2,1) both',
        'pulse-dot': 'pulseDot 1.6s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
