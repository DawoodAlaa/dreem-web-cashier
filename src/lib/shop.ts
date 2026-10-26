import { create } from 'zustand'
import { fetchAll, nums, q } from './api'
import { norm } from './format'
import { onChange, onResync, type Change } from './realtime'
import { supabase } from './supabase'
import type { Category, CompatGroup, Offer, Product, ProductView, Variant } from './types'

// الكتالوج (المنتجات والمخزون) بيتحمل مرة واحدة أول ما البرنامج يفتح ويتحفظ في الذاكرة.
// أي تغيير بيوصل من Realtime بيتطبق على الصف بتاعه بس، من غير ما نجيب كل المنتجات تاني.
// الجداول الصغيرة (الأصناف، الأجزاء، التوفيقات، العروض، الإعدادات) بتتجاب تاني لما تتغير.

export interface Parts {
  byParent: Map<number, { partId: number; qty: number }[]> // الشاحن الكامل ← أجزاءه
  parentsOf: Map<number, number[]> // الجزء ← الشواحن اللي فيها
}

interface ShopState {
  ready: boolean
  error: string | null
  views: ProductView[]
  byId: Map<number, ProductView>
  variantById: Map<number, Variant>
  categories: Category[]
  parts: Parts
  compat: CompatGroup[]
  offers: Offer[]
  settings: Record<string, string>
}

export const useShop = create<ShopState>(() => ({
  ready: false,
  error: null,
  views: [],
  byId: new Map(),
  variantById: new Map(),
  categories: [],
  parts: { byParent: new Map(), parentsOf: new Map() },
  compat: [],
  offers: [],
  settings: {},
}))

const products = new Map<number, Product>()
const variants = new Map<number, Variant>()

const fixProduct = (r: Product) => nums(r, ['cost_price', 'sell_price', 'min_sell_price', 'min_stock', 'id', 'category_id'])
const fixVariant = (r: Variant) => nums(r, ['stock', 'id', 'product_id', 'cost_price', 'sell_price', 'min_sell_price'])

function buildViews() {
  const byProduct = new Map<number, Variant[]>()
  for (const v of variants.values()) {
    if (v.archived) continue
    let a = byProduct.get(v.product_id)
    if (!a) byProduct.set(v.product_id, (a = []))
    a.push(v)
  }
  const views: ProductView[] = []
  const byId = new Map<number, ProductView>()
  for (const p of products.values()) {
    if (p.archived) continue
    const vs = byProduct.get(p.id)
    if (!vs || vs.length === 0) continue
    vs.sort((a, b) => a.id - b.id)
    let stock = 0
    let anyUnc = false
    let allUnc = true
    let canSell = false
    let low = false
    for (const v of vs) {
      if (v.uncounted) anyUnc = true
      else {
        allUnc = false
        stock += v.stock
        if (v.stock <= p.min_stock) low = true
      }
      if (v.uncounted || v.stock > 0) canSell = true
    }
    const view: ProductView = {
      p,
      vs,
      stock,
      outOfStock: !canSell,
      uncounted: anyUnc,
      allUncounted: allUnc,
      isLow: low,
      hasVariants: vs.length > 1 || (vs.length === 1 && vs[0].name != null),
      key: norm(`${p.name} ${p.imei ?? ''} ${vs.map((v) => v.name ?? '').join(' ')}`),
    }
    views.push(view)
    byId.set(p.id, view)
  }
  views.sort((a, b) => b.p.id - a.p.id)
  useShop.setState({ views, byId, variantById: new Map(variants) })
}

let emitTimer = 0
function emitSoon() {
  if (emitTimer) clearTimeout(emitTimer)
  emitTimer = window.setTimeout(() => {
    emitTimer = 0
    buildViews()
  }, 60)
}

async function loadCatalog() {
  const [prods, vars] = await Promise.all([
    fetchAll<Product>(() => supabase.from('products').select().eq('archived', false).order('id', { ascending: false })),
    fetchAll<Variant>(() => supabase.from('variants').select().eq('archived', false).order('id')),
  ])
  products.clear()
  variants.clear()
  for (const p of prods) products.set(p.id, fixProduct(p))
  for (const v of vars) variants.set(v.id, fixVariant(v))
  buildViews()
}

async function loadCategories() {
  const rows = await q(supabase.from('categories').select().eq('archived', false).order('sort_order').order('id'))
  useShop.setState({ categories: rows as Category[] })
}

async function loadParts() {
  const rows = await fetchAll<{ product_id: number; part_product_id: number; qty: number }>(() => supabase.from('product_parts').select())
  const byParent = new Map<number, { partId: number; qty: number }[]>()
  const parentsOf = new Map<number, number[]>()
  for (const r of rows) {
    if (!byParent.has(r.product_id)) byParent.set(r.product_id, [])
    byParent.get(r.product_id)!.push({ partId: r.part_product_id, qty: Number(r.qty) })
    if (!parentsOf.has(r.part_product_id)) parentsOf.set(r.part_product_id, [])
    parentsOf.get(r.part_product_id)!.push(r.product_id)
  }
  useShop.setState({ parts: { byParent, parentsOf } })
}

async function loadCompat() {
  const [groups, devices] = await Promise.all([
    q(supabase.from('compat_groups').select().eq('archived', false).order('id', { ascending: false })),
    fetchAll<{ group_id: number; device: string }>(() => supabase.from('compat_devices').select('group_id, device').order('id')),
  ])
  const byGroup = new Map<number, string[]>()
  for (const d of devices) {
    if (!byGroup.has(d.group_id)) byGroup.set(d.group_id, [])
    byGroup.get(d.group_id)!.push(d.device)
  }
  useShop.setState({
    compat: (groups as Omit<CompatGroup, 'devices'>[]).map((g) => ({ ...g, devices: byGroup.get(g.id) ?? [] })),
  })
}

async function loadOffers() {
  const rows = await q(supabase.from('offers').select('*, offer_items(product_id, qty)').eq('archived', false).order('id', { ascending: false }))
  useShop.setState({
    offers: (rows as (Omit<Offer, 'items'> & { offer_items: Offer['items'] })[]).map((o) => ({
      id: o.id,
      name: o.name,
      price: Number(o.price),
      archived: o.archived,
      items: o.offer_items.map((i) => ({ product_id: i.product_id, qty: Number(i.qty) })),
    })),
  })
}

async function loadSettings() {
  const rows = await q(supabase.from('app_settings').select('key, value'))
  useShop.setState({ settings: Object.fromEntries((rows as { key: string; value: string }[]).map((r) => [r.key, r.value])) })
}

const loaders: Record<string, () => Promise<void>> = {
  categories: loadCategories,
  product_parts: loadParts,
  compat_groups: loadCompat,
  compat_devices: loadCompat,
  offers: loadOffers,
  offer_items: loadOffers,
  app_settings: loadSettings,
}

const timers = new Map<() => Promise<void>, number>()
function scheduleLoad(fn: () => Promise<void>) {
  const t = timers.get(fn)
  if (t) clearTimeout(t)
  timers.set(
    fn,
    window.setTimeout(() => {
      timers.delete(fn)
      fn().catch(() => {})
    }, 250),
  )
}

function applyChange(c: Change) {
  if (c.table === 'products' || c.table === 'variants') {
    const isDel = c.eventType === 'DELETE'
    const rec = (isDel ? c.old : c.new) as Record<string, unknown>
    const id = Number(rec?.id)
    if (!id) return
    if (c.table === 'products') {
      if (isDel) products.delete(id)
      else products.set(id, fixProduct({ ...(c.new as unknown as Product) }))
    } else {
      if (isDel) variants.delete(id)
      else variants.set(id, fixVariant({ ...(c.new as unknown as Variant) }))
    }
    emitSoon()
    return
  }
  const l = loaders[c.table]
  if (l) scheduleLoad(l)
}

let offs: (() => void)[] = []

export async function startShop() {
  stopShop()
  offs.push(onChange(applyChange))
  offs.push(
    onResync(() => {
      loadCatalog().catch(() => {})
      for (const l of new Set(Object.values(loaders))) scheduleLoad(l)
    }),
  )
  try {
    await Promise.all([loadCatalog(), loadCategories(), loadParts(), loadCompat(), loadOffers(), loadSettings()])
    useShop.setState({ ready: true, error: null })
  } catch (e) {
    useShop.setState({ error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

export function stopShop() {
  offs.forEach((f) => f())
  offs = []
  products.clear()
  variants.clear()
  useShop.setState({
    ready: false,
    error: null,
    views: [],
    byId: new Map(),
    variantById: new Map(),
    categories: [],
    compat: [],
    offers: [],
    settings: {},
  })
}

export const reloadCatalog = () => loadCatalog()

// ───────── مساعدات ─────────

export const canSellVariant = (v: Variant) => v.uncounted || v.stock > 0

/** متابعة الكميات شغالة في المحل؟ (الإعدادات ← متابعة الكميات). لما تتقفل الكميات والجرد والمشتريات بيختفوا */
export const isTrackStock = (settings: Record<string, string>) => settings.track_stock !== '0'
export const useTrackStock = () => useShop((s) => isTrackStock(s.settings))

/** سعر النوع الفعلي: سعره لو ليه سعر، غير كده سعر المنتج */
export function vPrice(pv: ProductView, v: Variant) {
  return {
    cost: v.cost_price ?? pv.p.cost_price,
    sell: v.sell_price ?? pv.p.sell_price,
    min: v.min_sell_price ?? pv.p.min_sell_price,
    own: v.sell_price != null || v.min_sell_price != null || v.cost_price != null,
  }
}

/** أقل وأعلى سعر بيع وأقل سعر بين الأنواع (عشان الكارت) */
export function priceRange(pv: ProductView) {
  const ps = pv.vs.map((v) => vPrice(pv, v))
  const sells = ps.map((x) => x.sell)
  return { low: Math.min(...sells), high: Math.max(...sells), min: Math.min(...ps.map((x) => x.min)) }
}

export function firstSellable(pv: ProductView): Variant {
  return pv.vs.find(canSellVariant) ?? pv.vs[0]
}

/** الشاحن الكامل اللي الجزء ده ممكن يتفك منه (لو الجزء خلصان) */
export function splitSource(pv: ProductView, s = useShop.getState()): ProductView | null {
  if (!pv.outOfStock) return null
  for (const id of s.parts.parentsOf.get(pv.p.id) ?? []) {
    const parent = s.byId.get(id)
    if (parent && !parent.outOfStock) return parent
  }
  return null
}

/** الشاحن الخلصان اللي ممكن يتجمّع من أجزاءه */
export function assemblable(pv: ProductView, s = useShop.getState()): boolean {
  if (!pv.outOfStock) return false
  const parts = s.parts.byParent.get(pv.p.id)
  if (!parts || parts.length === 0) return false
  return parts.every((e) => {
    const v = s.byId.get(e.partId)
    return !!v && (v.allUncounted || v.stock >= e.qty)
  })
}

/** الكمية الإضافية اللي ممكن تتفك أو تتجمع (null = مفتوحة لأنها لسه متجردتش) */
export function extraAvailable(pv: ProductView, s = useShop.getState()): number | null {
  const parts = s.parts.byParent.get(pv.p.id)
  if (parts && parts.length) {
    const ps = parts.map((e) => ({ v: s.byId.get(e.partId), qty: e.qty }))
    if (ps.some((x) => !x.v)) return 0
    if (ps.some((x) => x.v!.allUncounted)) return null
    return Math.min(...ps.map((x) => Math.floor(x.v!.stock / x.qty)))
  }
  let sum = 0
  for (const parentId of s.parts.parentsOf.get(pv.p.id) ?? []) {
    const parent = s.byId.get(parentId)
    if (!parent) continue
    const per = s.parts.byParent.get(parentId)?.find((e) => e.partId === pv.p.id)?.qty ?? 0
    if (parent.uncounted) return null
    sum += parent.stock * per
  }
  return sum
}

export function categoryName(id: number): string {
  return useShop.getState().categories.find((c) => c.id === id)?.name ?? ''
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'مصاريف تشغيلية',
  'إيجار',
  'رواتب',
  'كهرباء ومياه',
  'صيانة وإصلاح',
  'مصاريف إدارية',
  'مصاريف تسويقية',
  'نثريات',
]

export const LOSS_REASONS = ['تالف', 'مكسور', 'مكسورة أثناء التركيب', 'مفقود', 'عيب صناعة']

export function expenseCategories(settings: Record<string, string>): string[] {
  try {
    const j = JSON.parse(settings.expense_categories ?? '')
    if (Array.isArray(j) && j.length) return j.map(String)
  } catch {
    /* القيمة الافتراضية */
  }
  return DEFAULT_EXPENSE_CATEGORIES
}

export function splitCategories(settings: Record<string, string>, categories: Category[]): number[] {
  try {
    const j = JSON.parse(settings.split_categories ?? '')
    if (Array.isArray(j)) return j.map(Number)
  } catch {
    /* الافتراضي: أصناف الشواحن */
  }
  return categories.filter((c) => c.icon === 'charger').map((c) => c.id)
}

export function splitHeadRatio(settings: Record<string, string>): number {
  const n = Number(settings.split_head_ratio)
  return Number.isFinite(n) && n > 0 ? n : 60
}
