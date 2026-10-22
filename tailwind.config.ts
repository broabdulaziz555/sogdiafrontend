import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * SOGDIA design system — soft institutional.
 *  - Navy-ink surfaces layered bg → panel → panel2, generous radii (cards 20px, tiles 12–16px, controls 12px, pills).
 *  - One vivid accent (lime) for primary actions; green/red are reserved for PnL; blue is the neutral data/info colour.
 *  - Elevation is soft: a 1px top highlight plus a wide, low-opacity drop shadow — no hard outlines doing the work.
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
        // Figures use the same family as text (tabular numerals) — monospace read as "terminal / robotic".
        mono: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '3xs': ['10px', '14px'],
        '2xs': ['11px', '15px'],
        xs: ['12px', '16px'],
        sm: ['13px', '19px'],
        base: ['14px', '20px'],
        md: ['15px', '22px'],
      },
      // Rounded scale: chips 6 · inputs/buttons 12 · tiles 16 · cards 20 · hero surfaces 28.
      borderRadius: {
        none: '0',
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
        full: '9999px',
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgb(255 255 255 / 0.045), 0 14px 34px -20px rgb(0 0 0 / 0.7)',
        panel: 'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 10px 28px -18px rgb(0 0 0 / 0.65)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.5), 0 10px 30px -10px rgb(var(--accent) / 0.45)',
        btn: 'inset 0 1px 0 rgb(255 255 255 / 0.35), 0 8px 20px -10px rgb(var(--accent) / 0.65)',
        pop: '0 0 0 1px rgb(var(--line2) / 0.7), 0 28px 64px -20px rgb(0 0 0 / 0.8)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        slideLeft: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fadeUp .24s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fadeIn .15s ease-out both',
        'scale-in': 'scaleIn .18s cubic-bezier(.2,.7,.2,1) both',
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
