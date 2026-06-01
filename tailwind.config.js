/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0f3460',
          medium: '#1a5fa8',
          light: '#2d7dd2',
        },
        gray: {
          bg: '#f0f4f8',
        },
        // Paleta del brand extraída del logo
        brand: {
          50:  '#EFF4FA',
          100: '#DCE7F2',
          200: '#B7CCE5',
          300: '#8DABCF',
          400: '#6F90BE',
          500: '#4A6FA5', // Primario — overoles + círculo del logo
          600: '#3D5C8C',
          700: '#324A72',
          800: '#283B5A', // Dark — headers, sidebar
          900: '#1E2D45',
        },
        // Paleta de acento del toolbox rojo
        accent: {
          50:  '#FBEEED',
          100: '#F7DDDB',
          200: '#EFB7B2',
          300: '#E69089',
          400: '#D06661',
          500: '#B73E3A', // Rojo del toolbox
          600: '#97302E',
          700: '#782623',
          800: '#5A1C19',
          900: '#3D1210',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
