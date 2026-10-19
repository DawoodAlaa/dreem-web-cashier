import { useCallback, useEffect, useRef, useState } from 'react'
import { errMsg } from './api'
import { onChange, onResync } from './realtime'

// قوايم كبيرة (الفواتير، السجل): بتتحمّل صفحة صفحة من السيرفر بدل ما تتحمّل كلها مرة واحدة.
// لما يحصل تغيير لحظي، بنجيب أول جزء بس (لحد REFRESH_MAX صف) ونسيب الباقي اللي اتحمّل زي ما هو.

const REFRESH_MAX = 200

type Builder = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>
}

interface Snapshot<T> {
  rows: T[]
  total: number | null
}
const cache = new Map<string, Snapshot<unknown>>()

export interface Paged<T> {
  rows: T[]
  total: number | null
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
  reload: () => void
}

/**
 * @param key بيتغير مع الفلاتر، وأي تغيير بيبدأ من الأول
 * @param build بيرجّع { q: الطلب } بالفلاتر والترتيب (order by id desc) و count: 'exact'
 */
export function usePaged<T extends { id: number }>(
  key: string,
  tables: readonly string[],
  build: () => Promise<{ q: Builder }>,
  map: (row: T) => T = (r) => r,
  pageSize = 50,
): Paged<T> {
  const cached = cache.get(key) as Snapshot<T> | undefined
  const [rows, setRows] = useState<T[]>(cached?.rows ?? [])
  const [total, setTotal] = useState<number | null>(cached?.total ?? null)
  const [loading, setLoading] = useState(!cached)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const st = useRef({ key, rows: cached?.rows ?? ([] as T[]), total: cached?.total ?? null, busy: false, timer: 0 })
  const buildRef = useRef(build)
  buildRef.current = build
  const mapRef = useRef(map)
  mapRef.current = map

  const commit = (k: string, r: T[], t: number | null) => {
    if (st.current.key !== k) return
    st.current.rows = r
    st.current.total = t
    cache.set(k, { rows: r, total: t })
    setRows(r)
    setTotal(t)
  }

  const fetchRange = async (from: number, to: number) => {
    // الطلب جوه object عشان ميتنفذش لوحده (طلبات Supabase بتتنفذ أول ما حد يعمل لها await)
    const { q } = await buildRef.current()
    const res = await q.range(from, to)
    if (res.error) throw res.error
    return { data: ((res.data ?? []) as T[]).map((r) => mapRef.current(r)), count: res.count ?? null }
  }

  /** أول جزء من القايمة (لحد اللي اتحمّل، بحد أقصى REFRESH_MAX) */
  const refresh = useCallback(async () => {
    const k = st.current.key
    const n = Math.min(Math.max(st.current.rows.length, pageSize), REFRESH_MAX)
    try {
      const { data, count } = await fetchRange(0, n - 1)
      // الصفوف اللي بعد الجزء ده بتفضل زي ما هي (الترتيب من الأحدث للأقدم)
      const last = data.length ? data[data.length - 1].id : Infinity
      const tail = data.length >= n ? st.current.rows.filter((r) => r.id < last) : []
      commit(k, [...data, ...tail], count)
      if (st.current.key === k) setError(null)
    } catch (e) {
      if (st.current.key === k) setError(errMsg(e))
    } finally {
      if (st.current.key === k) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize])

  const loadMore = useCallback(async () => {
    const s = st.current
    if (s.busy || (s.total != null && s.rows.length >= s.total)) return
    const k = s.key
    s.busy = true
    setLoadingMore(true)
    try {
      const { data, count } = await fetchRange(s.rows.length, s.rows.length + pageSize - 1)
      const seen = new Set(s.rows.map((r) => r.id))
      commit(k, [...s.rows, ...data.filter((r) => !seen.has(r.id))], count)
    } catch (e) {
      if (st.current.key === k) setError(errMsg(e))
    } finally {
      s.busy = false
      setLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize])

  useEffect(() => {
    const c = cache.get(key) as Snapshot<T> | undefined
    st.current.key = key
    st.current.rows = c?.rows ?? []
    st.current.total = c?.total ?? null
    setRows(st.current.rows)
    setTotal(st.current.total)
    setLoading(!c)
    setError(null)
    void refresh()
    const set = new Set(tables)
    const schedule = () => {
      clearTimeout(st.current.timer)
      st.current.timer = window.setTimeout(() => void refresh(), 300)
    }
    const off1 = onChange((ch) => {
      if (set.has(ch.table)) schedule()
    })
    const off2 = onResync(schedule)
    return () => {
      off1()
      off2()
      clearTimeout(st.current.timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tables.join(',')])

  return {
    rows,
    total,
    loading: loading && rows.length === 0,
    loadingMore,
    hasMore: total == null ? false : rows.length < total,
    error,
    loadMore,
    reload: () => void refresh(),
  }
}

/** نص البحث آمن يتحط في فلتر or(...) بتاع السيرفر */
export const safeSearch = (s: string) => s.replace(/[,()*%\\"':]/g, ' ').replace(/\s+/g, ' ').trim()

/** قيمة بتتأخر شوية (للبحث، عشان منبعتش طلب مع كل حرف) */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
