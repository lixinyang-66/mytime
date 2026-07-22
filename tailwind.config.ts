import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF8EC',
        sunrise: '#FFB86B',
        honey: '#FFE08A',
        mint: '#A7E8BD',
        skysoft: '#9ED8FF',
        coral: '#FF8A80',
        ink: '#283044',
      },
      boxShadow: {
        soft: '0 18px 55px rgba(88, 105, 135, 0.14)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};

export default config;
