import { create } from 'zustand'
import { EPS, roundMoney } from './format'
import { categoryName, extraAvailable, firstSellable, useShop } from './shop'
import type { CartLine, Offer, ProductView, Variant } from './types'

export type DiscMode = 'amount' | 'percent'

interface CartState {
  lines: CartLine[]
  discMode: DiscMode
  discValue: number
  customerId: number | null
  note: string
}

const KEY = 'cd.cart'
const empty: CartState = { lines: [], discMode: 'amount', discValue: 0, customerId: null, note: '' }

function load(): CartState {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (j && Array.isArray(j.lines)) return { ...empty, ...j }
  } catch {
    /* سلة فاضية */
  }
  return empty
}

export const useCart = create<CartState>(() => load())

useCart.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
})

export interface Totals {
  subtotal: number
  discount: number
  total: number
  minTotal: number
  count: number
  discountTooBig: boolean
}

export function totals(s: Pick<CartState, 'lines' | 'discMode' | 'discValue'>): Totals {
  let subtotal = 0
  let minTotal = 0
  let count = 0
  for (const l of s.lines) {
    subtotal += roundMoney(l.unitPrice * l.qty)
    minTotal += l.minPrice * l.qty
    count += l.qty
  }
  subtotal = roundMoney(subtotal)
  minTotal = roundMoney(minTotal)
  const v = Math.max(0, Number(s.discValue) || 0)
  const discount = roundMoney(Math.min(subtotal, s.discMode === 'percent' ? (subtotal * Math.min(v, 100)) / 100 : v))
  const total = roundMoney(subtotal - discount)
  return { subtotal, discount, total, minTotal, count, discountTooBig: total + EPS < minTotal }
}

export function lineFrom(pv: ProductView, v: Variant, qty: number, price: number): CartLine {
  return {
    variantId: v.id,
    productId: pv.p.id,
    productName: pv.p.name,
    variantName: v.name,
    imagePath: pv.p.image_url,
    categoryName: categoryName(pv.p.category_id) || null,
    costPrice: pv.p.cost_price,
    basePrice: pv.p.sell_price,
    minPrice: pv.p.min_sell_price,
    unitPrice: roundMoney(price),
    qty,
    offerName: null,
  }
}

/** الكمية المتاحة للبيع من اللون ده (null = مفتوحة، لسه متجردش) */
export function availableFor(variantId: number): number | null {
  const s = useShop.getState()
  const v = s.variantById.get(variantId)
  if (!v) return 0
  if (v.uncounted) return null
  const pv = s.byId.get(v.product_id)
  let extra: number | null = 0
  if (pv && pv.vs.length === 1) extra = extraAvailable(pv, s)
  if (extra === null) return null
  return v.stock + extra
}

export function inCart(variantId: number, lines = useCart.getState().lines, skip = -1): number {
  let n = 0
  lines.forEach((l, i) => {
    if (i !== skip && l.variantId === variantId) n += l.qty
  })
  return n
}

/** بيرجع رسالة خطأ لو الكمية مش متاحة */
export function checkStock(variantId: number, qty: number, skip = -1): string | null {
  const avail = availableFor(variantId)
  if (avail === null) return null
  const used = inCart(variantId, undefined, skip)
  if (used + qty > avail) {
    const left = Math.max(0, avail - used)
    return left === 0 ? 'الكمية المتاحة خلصت' : `الكمية المتاحة ${left} بس`
  }
  return null
}

export const cart = {
  add(line: CartLine) {
    useCart.setState((s) => {
      const i = s.lines.findIndex(
        (l) => l.variantId === line.variantId && Math.abs(l.unitPrice - line.unitPrice) < EPS && (l.offerName ?? null) === (line.offerName ?? null),
      )
      if (i >= 0) {
        const lines = s.lines.slice()
        lines[i] = { ...lines[i], qty: lines[i].qty + line.qty }
        return { lines }
      }
      return { lines: [...s.lines, line] }
    })
  },
  addMany(lines: CartLine[]) {
    lines.forEach((l) => cart.add(l))
  },
  setQty(i: number, qty: number) {
    useCart.setState((s) => {
      const lines = s.lines.slice()
      if (qty <= 0) lines.splice(i, 1)
      else lines[i] = { ...lines[i], qty }
      return { lines }
    })
  },
  setPrice(i: number, price: number) {
    useCart.setState((s) => {
      const lines = s.lines.slice()
      lines[i] = { ...lines[i], unitPrice: roundMoney(price) }
      return { lines }
    })
  },
  remove(i: number) {
    useCart.setState((s) => ({ lines: s.lines.filter((_, j) => j !== i) }))
  },
  clear() {
    useCart.setState({ ...empty })
  },
  setDiscount(mode: DiscMode, value: number) {
    useCart.setState({ discMode: mode, discValue: value })
  },
  setCustomer(id: number | null) {
    useCart.setState({ customerId: id })
  },
  setNote(note: string) {
    useCart.setState({ note })
  },
  snapshot(): CartState {
    return JSON.parse(JSON.stringify(useCart.getState()))
  },
  restore(s: CartState) {
    useCart.setState(s)
  },
}

// ───────── العروض ─────────

export interface OfferView {
  offer: Offer
  items: { pv: ProductView; qty: number }[]
  normal: number
  minTotal: number
  saving: number
  available: boolean
  summary: string
}

export function offerView(o: Offer, byId = useShop.getState().byId): OfferView {
  const items = o.items.map((i) => ({ pv: byId.get(i.product_id)!, qty: i.qty })).filter((x) => x.pv)
  const normal = items.reduce((s, e) => s + e.pv.p.sell_price * e.qty, 0)
  const minTotal = items.reduce((s, e) => s + e.pv.p.min_sell_price * e.qty, 0)
  return {
    offer: o,
    items,
    normal,
    minTotal,
    saving: normal - o.price,
    available: items.length > 0 && items.every((e) => !e.pv.outOfStock),
    summary: items.map((e) => (e.qty > 1 ? `${e.pv.p.name} × ${e.qty}` : e.pv.p.name)).join(' + '),
  }
}

/**
 * توزيع سعر العرض على منتجاته:
 * 1) كل منتج بياخد أقل سعر بيع بتاعه. 2) الزيادة بتتوزع بنسبة (سعر البيع − أقل سعر).
 * 3) تقريب لأقرب جنيه، وفرق التقريب على منتج كميته 1 عشان الإجمالي يطلع بالظبط سعر العرض.
 */
export function offerToLines(o: OfferView): CartLine[] {
  const parts = o.items.map((e) => ({ pv: e.pv, v: firstSellable(e.pv), qty: e.qty }))
  if (!parts.length) return []
  const extra = o.offer.price - o.minTotal
  const headroom = parts.reduce((s, p) => s + (p.pv.p.sell_price - p.pv.p.min_sell_price) * p.qty, 0)
  const weightSum = headroom > 0 ? headroom : parts.reduce((s, p) => s + p.pv.p.sell_price * p.qty, 0)
  const units = parts.map((p) => {
    const w = headroom > 0 ? p.pv.p.sell_price - p.pv.p.min_sell_price : p.pv.p.sell_price
    return p.pv.p.min_sell_price + (weightSum === 0 ? 0 : (extra * w) / weightSum)
  })
  const one = parts.findIndex((p) => p.qty === 1)
  const last = one >= 0 ? one : parts.length - 1
  const rounded = units.map((u, i) => (i === last ? 0 : Math.round(u)))
  let othersOk = true
  parts.forEach((p, i) => {
    if (i !== last && rounded[i] + EPS < p.pv.p.min_sell_price) othersOk = false
  })
  const othersSum = parts.reduce((s, p, i) => (i === last ? s : s + rounded[i] * p.qty), 0)
  const lastUnit = roundMoney((o.offer.price - othersSum) / parts[last].qty)
  const useRounded = othersOk && lastUnit + EPS >= parts[last].pv.p.min_sell_price
  return parts.map((p, i) => ({
    ...lineFrom(p.pv, p.v, p.qty, useRounded ? (i === last ? lastUnit : rounded[i]) : roundMoney(units[i])),
    offerName: o.offer.name,
  }))
}
