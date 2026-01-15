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
        }
      }
    },
  },
  plugins: [],
}
