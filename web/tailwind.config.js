/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0f0a1a',
          surface: '#1a1128',
          card: '#231838',
          border: '#2d1f45',
          accent: '#d6336c',
          'accent-hover': '#e8437a',
          'accent-glow': 'rgba(214, 51, 108, 0.3)',
          text: '#f0e6ff',
          'text-secondary': '#b8a4d6',
          muted: '#7c6a9a',
          error: '#ff4d6a',
          success: '#4dd67a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
