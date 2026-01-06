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
          purple: '#4A154B',
          'purple-dark': '#3D1140',
          'purple-light': '#611f69',
          green: '#2BAC76',
          yellow: '#ECB22E',
          red: '#E01E5A',
          blue: '#36C5F0',
          sidebar: '#3F0E40',
          hover: '#350d36',
          active: '#1164A3',
        }
      }
    },
  },
  plugins: [],
}
