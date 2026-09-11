import type { Config } from 'tailwindcss';

/**
 * Design tokens for the ops console. `brand` reuses the mobile app's olive
 * accent (see apps/mobile/src/constants/theme.ts `Colors.light.primary`) so
 * the admin panel still reads as Social Cup, not a generic SaaS template —
 * everything else here is deliberately neutral/structured for a
 * professional, data-dense tool rather than the consumer app's editorial feel.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F4F6EC',
          100: '#E6EAD3',
          200: '#CDD6A9',
          300: '#AFBE7E',
          400: '#93AA5D',
          500: '#7C8B4A',
          600: '#65713C',
          700: '#4F5830',
          800: '#3B4225',
          900: '#2B301B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 6px -1px rgb(15 23 42 / 0.06)',
        popover: '0 8px 24px -4px rgb(15 23 42 / 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config;
