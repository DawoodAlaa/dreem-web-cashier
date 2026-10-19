import { supabase } from './supabase'

export const NET_ERROR = 'مفيش اتصال بالنت. اتأكد من النت وجرب تاني'

export class AppError extends Error {}

function isNetwork(msg: string) {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|ERR_INTERNET|ERR_NETWORK/i.test(msg)
}

/** رسالة الخطأ بالعربي. رسايل دوال السيرفر مكتوبة بالعربي جاهزة، فبنعرضها زي ما هي */
export function errMsg(e: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return NET_ERROR
  if (e instanceof AppError) return e.message
  const m =
    typeof e === 'string'
      ? e
      : e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e)
  if (isNetwork(m)) return NET_ERROR
  if (/invalid login credentials/i.test(m)) return 'اسم المستخدم أو الباسورد غلط'
  if (/user already registered/i.test(m)) return 'اسم المستخدم ده متسجل قبل كده. اختار اسم تاني أو سجل دخول'
  if (/password should be at least/i.test(m)) return 'الباسورد لازم يبقى 6 حروف أو أرقام على الأقل'
  if (/jwt expired|invalid jwt|not authenticated/i.test(m)) return 'الجلسة خلصت. سجل دخول تاني'
  if (/permission denied/i.test(m)) return 'مش مسموح بالعملية دي. سجل دخول تاني أو اطلب الصلاحية من المدير'
  if (/rate limit/i.test(m)) return 'محاولات كتير ورا بعض. استنى دقيقة وجرب تاني'
  return m || 'حصل خطأ. جرب تاني'
}

export async function rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, params)
  } catch (e) {
    throw new AppError(errMsg(e))
  }
  if (res.error) throw new AppError(errMsg(res.error))
  return res.data as T
}

type Paged = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}

/** السيرفر بيرجع 1000 صف بالكتير في الطلب الواحد، فبنجيب صفحة صفحة لحد ما يخلص */
export async function fetchAll<T = Record<string, unknown>>(q: () => Paged, page = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += page) {
    let res
    try {
      res = await q().range(from, from + page - 1)
    } catch (e) {
      throw new AppError(errMsg(e))
    }
    if (res.error) throw new AppError(errMsg(res.error))
    const rows = (res.data ?? []) as T[]
    out.push(...rows)
    if (rows.length < page) break
  }
  return out
}

/** طلب واحد عادي مع تحويل الخطأ */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  let res
  try {
    res = await p
  } catch (e) {
    throw new AppError(errMsg(e))
  }
  if (res.error) throw new AppError(errMsg(res.error))
  return res.data as T
}

/** بيحوّل الأعمدة الرقمية (numeric) لأرقام، لأنها ممكن توصل كنص من Realtime */
export function nums<T extends object>(row: T, keys: (keyof T)[]): T {
  const r = row as Record<string, unknown>
  for (const k of keys as string[]) if (r[k] != null) r[k] = Number(r[k])
  return row
}
