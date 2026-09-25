/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
    './src/app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-roboto)', 'Roboto', 'system-ui', 'sans-serif'],
        sans: ['var(--font-roboto)', 'Roboto', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        bd: 'var(--bd)',
        bd2: 'var(--bd2)',
        t: 'var(--t)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        acc: 'var(--acc)',
        'acc-soft': 'var(--acc2)',
        blue: 'var(--blue)',
        green: 'var(--green)',
        orange: 'var(--orange)',
        red: 'var(--red)',
        yellow: 'var(--yellow)',
        purple: 'var(--purple)',
      },
      borderRadius: {
        xl2: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translate3d(0,12px,0)' },
          '100%': { opacity: '1', transform: 'translate3d(0,0,0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,.61,.36,1) both',
        'fade-in': 'fade-in .35s ease-out both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
