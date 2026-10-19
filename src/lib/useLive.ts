import { useCallback, useEffect, useRef, useState } from 'react'
import { errMsg } from './api'
import { onChange, onResync } from './realtime'

// بيانات الصفحة: بتتجاب لما الصفحة تتفتح، ولو جدول من [tables] اتغير بتتجاب تاني بعد 250ms
// (عشان التغييرات الكتير ورا بعض تتجمع في طلب واحد). آخر نتيجة بتتحفظ فالرجوع للصفحة بيبان على طول.

const cache = new Map<string, unknown>()
export const clearLiveCache = () => cache.clear()

export interface Live<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

export function useLive<T>(key: string | null, tables: readonly string[], fetcher: () => Promise<T>): Live<T> {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const state = useRef({ loading: false, again: false, timer: 0 as number | 0, alive: true, key })
  state.current.key = key

  const load = useCallback(async () => {
    const s = state.current
    if (s.key == null) return
    if (s.loading) {
      s.again = true
      return
    }
    s.loading = true
    const myKey = s.key
    try {
      const v = await fetchRef.current()
      if (s.alive && s.key === myKey) {
        cache.set(myKey, v)
        setData(v)
        setError(null)
      }
    } catch (e) {
      if (s.alive && s.key === myKey) setError(errMsg(e))
    } finally {
      s.loading = false
      if (s.alive) setLoading(false)
      if (s.again) {
        s.again = false
        void load()
      }
    }
  }, [])

  const schedule = useCallback(() => {
    const s = state.current
    if (s.timer) clearTimeout(s.timer)
    s.timer = window.setTimeout(() => {
      s.timer = 0
      void load()
    }, 250)
  }, [load])

  useEffect(() => {
    state.current.alive = true
    if (key == null) return
    const cached = cache.get(key) as T | undefined
    setData(cached)
    setLoading(cached === undefined)
    void load()
    const set = new Set(tables)
    const off1 = onChange((c) => {
      if (set.has(c.table)) schedule()
    })
    const off2 = onResync(schedule)
    return () => {
      off1()
      off2()
      if (state.current.timer) clearTimeout(state.current.timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tables.join(',')])

  useEffect(
    () => () => {
      state.current.alive = false
    },
    [],
  )

  return { data, error, loading: loading && data === undefined, reload: load }
}
