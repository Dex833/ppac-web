/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens
        surface: '#f6fbf7',  // page bg
        border:  '#dceee2',
        ink:     '#0f2d1f',  // default text

        // Greens
        brand: {
          50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',
          400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',
          800:'#166534',900:'#14532d'
        },

        moss: {
          50:'#f3faf6',100:'#e6f4ec',200:'#cde9d9',300:'#afd7c1',
          400:'#8cc3a5',500:'#6aa98a',600:'#4f8f70',700:'#3f725a',
          800:'#345b49',900:'#274537'
        },

        fern: { DEFAULT:'#84cc16', dark:'#65a30d' },
        bark: { DEFAULT:'#5c4a32' },
        sky:  { DEFAULT:'#0ea5a5' },

        // handy aliases
        primary: '#16a34a', // brand-600
        accent:  '#84cc16', // fern
        muted:   '#e6f4ec', // moss-100
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },

      boxShadow: {
        card: '0 12px 28px -12px rgba(20, 83, 45, 0.18)',
      },

      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },

      backgroundImage: {
        leaf: 'radial-gradient(1100px 500px at 100% -10%, rgba(34,197,94,.08), transparent 60%)',
      },
    },
  },
  plugins: [],
};
