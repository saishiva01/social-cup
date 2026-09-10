import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Social Cup brand tokens (mirrors apps/mobile/src/constants/theme.ts)
        // so this app's two pages don't invent a second visual language.
        brand: {
          primary: '#7C8B4A',
          primaryPressed: '#6C7A3E',
          error: '#C1442C',
          success: '#188038',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
