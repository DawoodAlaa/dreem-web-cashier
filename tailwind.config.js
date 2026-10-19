/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // أنواع الأزرار بتتكتب بشكل ديناميكي (btn-variant)
  safelist: ['btn-primary', 'btn-soft', 'btn-outline', 'btn-danger', 'btn-danger-soft', 'btn-green', 'btn-ghost', 'btn-sm'],
  theme: {
    extend: {
      fontFamily: { sans: ['Tajawal', 'system-ui', 'sans-serif'] },
      colors: {
        primary: { DEFAULT: '#1570EF', light: '#EAF2FF', dark: '#0B55C9' },
        bg: '#F3F6FB',
        line: { DEFAULT: '#E3E9F2', soft: '#EEF2F8' },
        ink: { DEFAULT: '#0F1A3A', 2: '#3B4866', 3: '#7A879F' },
        green: { DEFAULT: '#16A34A', light: '#E7F7EC' },
        red: { DEFAULT: '#E11D48', light: '#FDECEF' },
        orange: { DEFAULT: '#EA8A0B', light: '#FFF3E0' },
        purple: { DEFAULT: '#7C3AED', light: '#F1EAFE' },
        teal: { DEFAULT: '#0D9488', light: '#E3F6F4' },
      },
      borderRadius: { card: '16px', btn: '12px' },
      boxShadow: { card: '0 1px 2px rgba(15,26,58,.04), 0 1px 1px rgba(15,26,58,.02)', sheet: '0 -8px 30px rgba(15,26,58,.12)' },
      screens: { lg: '1000px' },
    },
  },
  plugins: [],
}
