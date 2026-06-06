/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg:      '#0e1621',
          sidebar: '#17212b',
          hover:   '#202e3e',
          active:  '#2b5278',
          own:     '#2b5278',
          other:   '#182533',
          header:  '#17212b',
          input:   '#242f3d',
          accent:  '#2aabee',
          muted:   '#6c8998',
          border:  '#0e1621',
          search:  '#1c2b3a',
          date:    '#182533',
        },
      },
    },
  },
  plugins: [],
}
