// الأرقام والتواريخ (العرض بفاصل الآلاف، والأيام بتوقيت القاهرة)

export const CURRENCY = 'ج.م'
export const EPS = 0.005
export const TZ = 'Africa/Cairo'

export const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function money(v: number | null | undefined): string {
  const r = roundMoney(Number(v) || 0)
  return moneyFmt.format(r === 0 ? 0 : r)
}
export const moneyC = (v: number | null | undefined) => `${money(v)} ${CURRENCY}`
export const int = (v: number | null | undefined) => intFmt.format(Number(v) || 0)
export const num = (v: unknown) => (v == null ? 0 : Number(v) || 0)

/** بيقرا رقم من نص (بيقبل الأرقام العربية والفاصلة العشرية العربية) */
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null) return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const ar = '٠١٢٣٤٥٦٧٨٩'
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  let out = ''
  for (const ch of s.trim()) {
    const i = ar.indexOf(ch)
    const j = fa.indexOf(ch)
    if (i >= 0) out += i
    else if (j >= 0) out += j
    else if (ch === '٫') out += '.'
    else if (ch === ',' || ch === '،' || ch === ' ') continue
    else out += ch
  }
  if (!out) return null
  const n = Number(out)
  return Number.isFinite(n) ? n : null
}
export const parseInt0 = (s: string) => {
  const n = parseNum(s)
  return n == null ? null : Math.round(n)
}

// ───────── التواريخ بتوقيت القاهرة ─────────

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number }
function cairoParts(d: Date): Parts {
  const o: Record<string, number> = {}
  for (const p of partsFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second }
}

/** فرق توقيت القاهرة عن UTC بالمللي ثانية في اللحظة دي */
function offsetAt(t: number): number {
  const p = cairoParts(new Date(t))
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
}

/** بداية يوم (سنة/شهر/يوم بتوقيت القاهرة) كلحظة حقيقية */
export function cairoMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetAt(guess)
  t = guess - offsetAt(t)
  return new Date(t)
}

export function dayStart(d: Date = new Date()): Date {
  const p = cairoParts(d)
  return cairoMidnight(p.y, p.m, p.d)
}
export function addDays(d: Date, n: number): Date {
  const p = cairoParts(d)
  return cairoMidnight(p.y, p.m, p.d + n)
}

/** يوم بصيغة 2026-10-19 (بتوقيت القاهرة) */
export function ymd(d: Date | string): string {
  const p = cairoParts(typeof d === 'string' ? new Date(d) : d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return cairoMidnight(y, m, d)
}

export function dateFmt(d: Date | string | null | undefined): string {
  if (!d) return ''
  const p = cairoParts(typeof d === 'string' ? new Date(d) : d)
  return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`
}
export function timeFmt(d: Date | string | null | undefined): string {
  if (!d) return ''
  const p = cairoParts(typeof d === 'string' ? new Date(d) : d)
  const h = p.h % 12 === 0 ? 12 : p.h % 12
  return `${String(h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'ص' : 'م'}`
}
export const dateTimeFmt = (d: Date | string | null | undefined) => (d ? `${dateFmt(d)}  ${timeFmt(d)}` : '')

export function daysAgo(d: Date | string): number {
  const t = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - t.getTime()) / 86400000)
}

// ───────── الفترات ─────────

export type RangeKey = 'today' | 'week' | 'month' | 'all' | 'custom'
export interface DateRange {
  key: RangeKey
  from: Date // شامل
  to: Date // مش شامل
}

export function makeRange(key: RangeKey, from?: string, to?: string): DateRange {
  const now = new Date()
  const today = dayStart(now)
  const tomorrow = addDays(now, 1)
  switch (key) {
    case 'today':
      return { key, from: today, to: tomorrow }
    case 'week':
      return { key, from: addDays(now, -6), to: tomorrow }
    case 'month': {
      const p = cairoParts(now)
      return { key, from: cairoMidnight(p.y, p.m, 1), to: tomorrow }
    }
    case 'all':
      return { key, from: new Date('2000-01-01T00:00:00Z'), to: new Date('2100-01-01T00:00:00Z') }
    case 'custom': {
      const f = from ? fromYmd(from) : today
      const t = to ? addDays(fromYmd(to), 1) : tomorrow
      return { key, from: f, to: t }
    }
  }
}

export const rangeLabels: Record<RangeKey, string> = {
  today: 'اليوم',
  week: '7 أيام',
  month: 'الشهر',
  all: 'الكل',
  custom: 'فترة مخصصة',
}

export const iso = (d: Date) => d.toISOString()

export const variantLabel = (product: string, variant: string | null | undefined) => (variant ? `${product} (${variant})` : product)

/** بيوحّد الحروف العربية عشان البحث (أ إ آ ← ا، ة ← ه، ى ← ي) */
export function norm(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '')
    .trim()
}
