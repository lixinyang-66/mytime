import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8EC',
        sunrise: '#FFB56A',
        honey: '#FFE09A',
        mint: '#B9EBCB',
        skysoft: '#AEDCFF',
        coral: '#F58E78',
        ink: '#2F405A',
      },
      boxShadow: {
        soft: '0 7px 0 rgba(184, 127, 77, 0.11), 0 18px 32px rgba(119, 84, 61, 0.13)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};

export default config;
