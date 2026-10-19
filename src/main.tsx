import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: يشتغل زي التطبيق ويفتح أسرع من الكاش
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

// وضع التطوير بس: نكشف المخازن عشان نجرب الشاشات ببيانات تجريبية
if (import.meta.env.DEV) {
  void Promise.all([import('./lib/auth'), import('./lib/shop'), import('./lib/cart'), import('./lib/supabase')]).then(([a, s, c, sb]) => {
    Object.assign(window, { __stores: { useAuth: a.useAuth, useShop: s.useShop, useCart: c.useCart, supabase: sb.supabase } })
  })
}
