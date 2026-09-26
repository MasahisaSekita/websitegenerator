/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--theme-primary) / <alpha-value>)',
        'primary-dark': 'rgb(var(--theme-primary-dark) / <alpha-value>)',
        'primary-light': 'rgb(var(--theme-primary-light) / <alpha-value>)',
        accent: 'rgb(var(--theme-accent) / <alpha-value>)',
        'accent-dark': 'rgb(var(--theme-accent-dark) / <alpha-value>)',
        background: '#F7F9FC',
        surface: '#FFFFFF',
        ink: '#0F172A',
        muted: '#5B6577',
        divider: '#E3E8EF',
        deep: '#0B1220',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2.5xl': '1.25rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
        '7xl': '4rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
        float: 'float 6s ease-in-out infinite',
        marquee: 'marquee 60s linear infinite',
        'spin-slow': 'spin 14s linear infinite',
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--theme-primary) / 0.15), 0 20px 60px -20px rgb(var(--theme-primary) / 0.35)',
      },
    },
  },
  plugins: [],
}
