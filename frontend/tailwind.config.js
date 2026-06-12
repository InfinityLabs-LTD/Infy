/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { deep: '#080B16', base: '#0B1020' },
        glass: {
          1: 'rgba(255,255,255,0.04)',
          2: 'rgba(255,255,255,0.08)',
          3: 'rgba(255,255,255,0.12)',
          stroke: 'rgba(255,255,255,0.08)',
        },
        primary: '#7C3AED',
        accent: '#A855F7',
        highlight: '#C084FC',
        ink: { hi: '#FFFFFF', mid: '#CBD5E1', low: '#64748B' },
        ok: '#22C55E',
        danger: '#EF4444',
        warn: '#F59E0B',
      },
      borderRadius: { bubble: '20px' },
      backdropBlur: { card: '12px', panel: '24px', pop: '40px' },
      boxShadow: {
        soft: '0 4px 24px rgba(0,0,0,.25)',
        float: '0 12px 40px rgba(0,0,0,.45)',
        glow: '0 0 24px rgba(124,58,237,.35)',
      },
      backgroundImage: {
        'grad-own': 'linear-gradient(135deg,#7C3AED 0%,#A855F7 60%,#C084FC 130%)',
        aurora:
          'radial-gradient(1200px 800px at 80% -10%, rgba(124,58,237,.14), transparent 60%), radial-gradient(900px 600px at -10% 110%, rgba(168,85,247,.08), transparent 50%)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope Variable', 'Inter Variable', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: { fluid: 'cubic-bezier(.32,.72,0,1)' },
    },
  },
  plugins: [],
}
