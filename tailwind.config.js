/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text',
          'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
        mono: ['SF Mono', 'ui-monospace', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // Tokens dipetakan ke CSS variable supaya satu set kelas
        // otomatis benar di light maupun dark theme.
        glass: {
          bg: 'rgb(var(--glass-bg) / <alpha-value>)',
          border: 'rgb(var(--glass-border) / <alpha-value>)',
          hi: 'rgb(var(--glass-highlight) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      borderRadius: {
        glass: '22px',
        pill: '999px',
      },
      boxShadow: {
        glass: '0 8px 32px -8px rgb(var(--shadow) / 0.28), 0 2px 8px -2px rgb(var(--shadow) / 0.16)',
        'glass-lg': '0 24px 64px -16px rgb(var(--shadow) / 0.40), 0 8px 24px -8px rgb(var(--shadow) / 0.20)',
        'glass-inset': 'inset 0 1px 0 0 rgb(var(--glass-highlight) / 0.55)',
        glow: '0 0 0 4px rgb(var(--accent) / 0.18)',
      },
      backdropBlur: {
        glass: '28px',
        heavy: '48px',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': {
          from: { opacity: '0', transform: 'translateY(24px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(3%,-4%,0) scale(1.06)' },
          '66%': { transform: 'translate3d(-3%,3%,0) scale(.96)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up .38s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .3s ease both',
        'scale-in': 'scale-in .26s cubic-bezier(.22,1,.36,1) both',
        'sheet-up': 'sheet-up .34s cubic-bezier(.22,1,.36,1) both',
        drift: 'drift 26s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
