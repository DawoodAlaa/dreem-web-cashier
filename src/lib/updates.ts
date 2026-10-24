import { useEffect, useState } from 'react'

// التحديثات: التطبيق المتسطب على الموبايل ممكن يفضل شغال بالنسخة القديمة (بيكمّل من الخلفية من غير ما يفتح الصفحة من جديد).
// فبنشيك على النسخة اللي على السيرفر لما التطبيق يتفتح وكل شوية، ولو اتغيرت بنقول للمستخدم يحدّث.

const CHECK_EVERY = 5 * 60 * 1000
const SCRIPT = /assets\/index-[\w-]+\.js/

const loadedScript = () => [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.src.match(SCRIPT)?.[0]).find(Boolean)

async function hasUpdate(): Promise<boolean> {
  const cur = loadedScript()
  if (!cur) return false // وضع التطوير
  const res = await fetch(`./index.html?u=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return false
  const live = (await res.text()).match(SCRIPT)?.[0]
  return !!live && live !== cur
}

export function reloadApp() {
  void navigator.serviceWorker
    ?.getRegistration()
    .then((r) => r?.update())
    .catch(() => {})
    .finally(() => location.reload())
}

export function useUpdateAvailable(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    let last = 0
    const check = () => {
      if (!navigator.onLine || Date.now() - last < 30_000) return
      last = Date.now()
      hasUpdate()
        .then((u) => alive && u && setReady(true))
        .catch(() => {})
    }
    const onVisible = () => document.visibilityState === 'visible' && check()
    check()
    const t = window.setInterval(check, CHECK_EVERY)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', check)
    return () => {
      alive = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', check)
    }
  }, [])
  return ready
}

// صفحة اتمسحت من السيرفر بعد تحديث (النسخة القديمة لسه شغالة): نعيد تحميل التطبيق مرة واحدة
export function retryChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((err) => {
      const KEY = 'cd.chunkReload'
      let last = 0
      try {
        last = Number(sessionStorage.getItem(KEY) || 0)
        sessionStorage.setItem(KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
      if (Date.now() - last > 60_000) {
        location.reload()
        return new Promise<T>(() => {})
      }
      throw err
    })
}
