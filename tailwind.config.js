/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211c',
        paper: '#f7f5ef',
        moss: '#566b4f',
        palm: '#0f766e',
        gold: '#b7791f',
        brick: '#9f3a38'
      },
      boxShadow: {
        panel: '0 12px 36px rgba(23, 33, 28, 0.09)'
      }
    },
  },
  plugins: [],
};
