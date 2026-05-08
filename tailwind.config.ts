import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { 
          DEFAULT: 'hsl(var(--primary))', 
          foreground: 'hsl(var(--primary-foreground))' 
        },
        secondary: { 
          DEFAULT: 'hsl(var(--secondary))', 
          foreground: 'hsl(var(--secondary-foreground))' 
        },
        destructive: { 
          DEFAULT: 'hsl(var(--destructive))', 
          foreground: 'hsl(var(--destructive-foreground))' 
        },
        muted: { 
          DEFAULT: 'hsl(var(--muted))', 
          foreground: 'hsl(var(--muted-foreground))' 
        },
        accent: { 
          DEFAULT: 'hsl(var(--accent))', 
          foreground: 'hsl(var(--accent-foreground))' 
        },
        popover: { 
          DEFAULT: 'hsl(var(--popover))', 
          foreground: 'hsl(var(--popover-foreground))' 
        },
        card: { 
          DEFAULT: 'hsl(var(--card))', 
          foreground: 'hsl(var(--card-foreground))' 
        },
        gold: { 
          300: '#f3db99', 
          400: '#e7b733', 
          500: '#c49a1a', 
          600: '#9c7b15', 
          700: '#755c10' 
        },
        navy: { 
          500: '#4168b4', 
          600: '#1b2a4a', 
          700: '#152240', 
          800: '#0f1a36', 
          900: '#0a122c', 
          950: '#050a1f' 
        },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'gold': '0 0 30px rgba(231, 183, 51, 0.15)',
        'gold-lg': '0 0 60px rgba(231, 183, 51, 0.2)',
      },
      animation: {
        'fade-in': 'fade-in-up 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 1.8s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
