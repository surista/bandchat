/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slack: {
          purple: 'var(--color-accent)',
          'purple-dark': '#3D1140',
          'purple-light': 'var(--color-accent-hover)',
          green: 'var(--color-primary)',
          yellow: '#ECB22E',
          red: '#E01E5A',
          blue: '#36C5F0',
          sidebar: 'var(--color-sidebar)',
          hover: 'var(--color-sidebar-hover)',
          active: 'var(--color-sidebar-active)',
        },
        surface: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
        },
        content: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
        },
      }
    },
  },
  plugins: [],
}
