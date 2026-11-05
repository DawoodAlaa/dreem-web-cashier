// Service worker: الموقع يفتح بسرعة من الكاش (زي التطبيق). البيانات نفسها دايماً من السيرفر.
const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (!sameOrigin && !isFont) return // طلبات السيرفر (Supabase) متتخزنش أبداً
  if (sameOrigin && url.searchParams.has('u')) return // التشييك على التحديثات: من السيرفر على طول

  // الصفحة نفسها: من النت الأول ومن غير كاش المتصفح (عشان التحديثات توصل)، ولو مفيش نت من الكاش
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((res) => {
          if (res.redirected) return fetch(req) // التحويلات (زي إضافة / في الآخر) يعملها المتصفح نفسه
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // الملفات (أسماءها فيها hash) والخطوط: من الكاش الأول
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone()
            caches.open(ASSETS).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
