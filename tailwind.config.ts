import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * SOGDIA design system — institutional / information-dense.
 *  - Surfaces: #080C12 (bg) · #111A25 (panel). Accent: #B7F36B. 1px hairlines, no soft shadows.
 *  - Radii are deliberately tight (2–4px) so every existing `rounded-*` utility reads as a sharp instrument panel.
 */
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
        line2: c('line2'),
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
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '3xs': ['9px', '12px'],
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
        md: ['14px', '22px'],
      },
      // Sharp corners everywhere. `full` is kept for status dots only.
      borderRadius: {
        none: '0',
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '3px',
        '2xl': '4px',
        '3xl': '4px',
        full: '9999px',
      },
      // Flat: borders do the work. Overlays get a single tight shadow so menus separate from the page.
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.55)',
        panel: 'none',
        pop: '0 0 0 1px rgb(var(--line2)), 0 10px 24px -12px rgb(0 0 0 / 0.7)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        slideLeft: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fadeUp .24s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fadeIn .15s ease-out both',
        'scale-in': 'scaleIn .12s cubic-bezier(.2,.7,.2,1) both',
        'slide-left': 'slideLeft .2s cubic-bezier(.2,.7,.2,1) both',
        'slide-up': 'slideUp .22s cubic-bezier(.2,.7,.2,1) both',
        'pulse-dot': 'pulseDot 1.6s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [
    // iOS / Android notch + home-indicator handling (requires `viewport-fit=cover`, set in app/layout.tsx).
    plugin(({ addUtilities }) => {
      addUtilities({
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top)' },
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom)' },
        '.pl-safe': { paddingLeft: 'env(safe-area-inset-left)' },
        '.pr-safe': { paddingRight: 'env(safe-area-inset-right)' },
        '.px-safe': { paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' },
        '.p-safe': {
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        },
        '.top-safe': { top: 'env(safe-area-inset-top)' },
        '.bottom-safe': { bottom: 'env(safe-area-inset-bottom)' },
        '.min-h-screen-safe': { minHeight: ['100vh', '100dvh'] },
      });
    }),
  ],
};

export default config;
