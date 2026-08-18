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
        terracotta: '#E07A5F',
        peach: '#FFD4B3',
        sage: '#C5D5B8',
        warmrose: '#F4A9A8',
        amberwarm: '#F2CC8F',
        sand: '#F5E6D3',
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
