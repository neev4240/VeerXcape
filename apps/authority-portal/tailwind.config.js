/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        veer: {
          surface: '#FFFFFF',
          border: '#E2E8F0',
          text: '#0F172A',
          sapphire: '#1E40AF',
          blue: '#2563EB',
          critical: '#DC2626',
          amber: '#D97706',
          emerald: '#059669'
        }
      }
    }
  },
  plugins: []
};

