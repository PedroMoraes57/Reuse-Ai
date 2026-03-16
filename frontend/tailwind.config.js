/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        reuseai: {
          preto: '#1c1c25',
          cinza: '#414141',
          verdeClaro: '#78d84e',
          azul: '#2C93CF',
          azulClaro: '#38b6ff',
          verde: '#4a701c',
          verdeEscuro: '#0f1f0f',
          verdeNeon: '#22c55e',
          branco: '#fbfbfb',
        },
      },
    },
  },
  plugins: [],
};
