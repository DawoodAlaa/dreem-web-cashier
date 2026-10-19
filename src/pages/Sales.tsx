import { ChevronUp, Gift, LayoutGrid, Minus, PauseCircle, Plus, ShoppingCart, Trash2, UserRound, X, Zap } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { CustomerPicker, useCustomers } from '@/components/CustomerPicker'
import { CategoryIcon } from '@/components/icons'
import { ProductForm, ProductImage } from '@/components/ProductForm'
import { Button, Chips, Empty, Field, IconButton, Modal, Money, NumInput, SearchBox, Segmented, Select, Tag, TextArea, confirmDialog, cx, promptDialog, useIsMobile } from '@/components/ui'
import { VirtualGrid } from '@/components/virtual'
import { fetchAll, nums, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { availableFor, cart, checkStock, lineFrom, offerToLines, offerView, totals, useCart, type OfferView } from '@/lib/cart'
import { EPS, dateTimeFmt, money, norm, parseInt0, parseNum, roundMoney, variantLabel } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { assemblable, canSellVariant, extraAvailable, firstSellable, splitSource, useShop } from '@/lib/shop'
import { supabase } from '@/lib/supabase'
import { run, toast, toastError } from '@/lib/toast'
import type { HeldCart, ProductView, Variant } from '@/lib/types'
import { useLive } from '@/lib/useLive'

type Sort = 'new' | 'name' | 'price' | 'qty'
const ALL = -1
const OFFERS = -2

export default function SalesPage() {
  const views = useShop((s) => s.views)
  const categories = useShop((s) => s.categories)
  const compat = useShop((s) => s.compat)
  const offers = useShop((s) => s.offers)
  const byId = useShop((s) => s.byId)
  const parts = useShop((s) => s.parts)
  const canAdd = useCan('products')
  const mobile = useIsMobile()
  const salesQuery = useNav((s) => s.salesQuery)

  const [cat, setCat] = useState<number>(ALL)
  const [q, setQ] = useState(salesQuery ?? '')
  const [sort, setSort] = useState<Sort>('new')
  const [picked, setPicked] = useState<ProductView | null>(null)
  const [adding, setAdding] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    if (salesQuery != null) {
      setQ(salesQuery)
      setCat(ALL)
      useNav.setState({ salesQuery: null })
    }
  }, [salesQuery])

  const offerViews = useMemo(() => offers.map((o) => offerView(o, byId)).filter((o) => o.items.length), [offers, byId])

  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const v of views) m.set(v.p.category_id, (m.get(v.p.category_id) ?? 0) + 1)
    return m
  }, [views])

  // البحث بالتوفيقات: لو اللي بيدور عليه اسم جهاز، الاسكرينات اللي بتركب عليه تظهر بعلامة "متوافق"
  const nq = norm(q)
  const compatIds = useMemo(() => {
    const ids = new Set<number>()
    if (!nq) return ids
    for (const g of compat) {
      if (g.base_product_id == null) continue
      if (norm(g.name).includes(nq) || g.devices.some((d) => norm(d).includes(nq))) ids.add(g.base_product_id)
    }
    return ids
  }, [compat, nq])

  const list = useMemo(() => {
    const tokens = nq.split(/\s+/).filter(Boolean)
    let out = views.filter((v) => {
      if (cat >= 0 && v.p.category_id !== cat) return false
      if (!tokens.length) return true
      if (compatIds.has(v.p.id)) return true
      return tokens.every((t) => v.key.includes(t))
    })
    if (sort === 'name') out = out.slice().sort((a, b) => a.p.name.localeCompare(b.p.name, 'ar'))
    else if (sort === 'price') out = out.slice().sort((a, b) => a.p.sell_price - b.p.sell_price)
    else if (sort === 'qty') out = out.slice().sort((a, b) => b.stock - a.stock)
    if (compatIds.size) out = out.slice().sort((a, b) => Number(compatIds.has(b.p.id)) - Number(compatIds.has(a.p.id)))
    return out
    // parts بيأثر على حالة الكروت (يتفك/يتجمع)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, cat, nq, sort, compatIds, parts])

  const filteredOffers = useMemo(() => (nq ? offerViews.filter((o) => norm(o.offer.name + ' ' + o.summary).includes(nq)) : offerViews), [offerViews, nq])

  const catOptions = [
    { value: ALL, label: 'الكل', count: views.length },
    ...(offerViews.length ? [{ value: OFFERS, label: <><Gift className="h-4 w-4" />العروض</>, count: offerViews.length }] : []),
    ...categories.map((c) => ({ value: c.id, label: <><CategoryIcon icon={c.icon} className="h-4 w-4" />{c.name}</>, count: counts.get(c.id) ?? 0 })),
  ]

  return (
    <div className="lg:flex lg:gap-5">
      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        <div className="mb-3 space-y-3">
          <Chips options={catOptions} value={cat} onChange={setCat} />
          <div className="flex flex-wrap gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="بحث بالاسم أو اسم الجهاز (زي A54)" className="min-w-[200px] flex-1" />
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto min-w-[8.5rem] flex-none" aria-label="الترتيب">
              <option value="new">الأحدث</option>
              <option value="name">الاسم</option>
              <option value="price">السعر</option>
              <option value="qty">الكمية</option>
            </Select>
            {canAdd && (
              <Button variant="soft" icon={<Zap className="h-5 w-5" />} onClick={() => setAdding(true)}>
                <span className="hidden sm:inline">إضافة منتج سريع</span>
                <span className="sm:hidden">إضافة</span>
              </Button>
            )}
          </div>
        </div>

        {cat === OFFERS ? (
          filteredOffers.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredOffers.map((o) => (
                <OfferCard key={o.offer.id} o={o} />
              ))}
            </div>
          ) : (
            <Empty icon={<Gift />} text="مفيش عروض مطابقة" />
          )
        ) : list.length === 0 ? (
          <Empty icon={<LayoutGrid />} text={views.length ? 'مفيش منتجات مطابقة' : 'مفيش منتجات لسه'} />
        ) : (
          <VirtualGrid
            items={list}
            minWidth={mobile ? 150 : 175}
            rowHeight={mobile ? 238 : 262}
            getKey={(v) => v.p.id}
            render={(v) => <SaleCard pv={v} compatible={compatIds.has(v.p.id)} onPick={setPicked} />}
          />
        )}
      </div>

      {/* السلة: عمود على الكمبيوتر، وشريط تحت على الموبايل */}
      {!mobile ? (
        <aside className="sticky top-[88px] h-[calc(100dvh-112px)] w-[380px] shrink-0 xl:w-[420px]">
          <CartPanel />
        </aside>
      ) : (
        <>
          <MobileCartBar onOpen={() => setCartOpen(true)} />
          <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="السلة">
            <CartPanel inSheet onDone={() => setCartOpen(false)} />
          </Modal>
        </>
      )}

      {picked && <AddToCart pv={picked} onClose={() => setPicked(null)} />}
      {adding && <ProductForm open defaultCategory={cat >= 0 ? cat : null} onClose={() => setAdding(false)} />}
    </div>
  )
}

// ───────── كارت المنتج ─────────

const SaleCard = memo(function SaleCard({ pv, compatible, onPick }: { pv: ProductView; compatible: boolean; onPick: (v: ProductView) => void }) {
  const icon = useShop((s) => s.categories.find((c) => c.id === pv.p.category_id)?.icon ?? 'box')
  const split = splitSource(pv)
  const asm = !split && assemblable(pv)
  const out = pv.outOfStock && !split && !asm
  let qty: React.ReactNode
  if (split) qty = <span className="text-purple">يتفك من {split.p.name}</span>
  else if (asm) qty = <span className="text-purple">يتجمّع من الأجزاء</span>
  else if (pv.allUncounted) qty = <span className="text-orange">لسه متجردش</span>
  else if (out) qty = <span className="text-red">خلص</span>
  else qty = <span className={pv.isLow ? 'text-orange' : 'text-ink-2'}>الكمية: <span className="num">{pv.stock}</span>{pv.uncounted ? ' +' : ''}</span>
  return (
    <button
      type="button"
      onClick={() => onPick(pv)}
      disabled={out}
      className={cx(
        'card flex h-[228px] w-full flex-col overflow-hidden text-right transition active:scale-[0.98] lg:h-[252px]',
        out ? 'opacity-50' : 'hover:border-primary/50 hover:shadow-md',
      )}
    >
      <div className="relative h-[110px] w-full shrink-0 lg:h-[128px]">
        <ProductImage url={pv.p.image_url} className="h-full w-full" icon={<CategoryIcon icon={icon} className="h-10 w-10 opacity-40" />} />
        <div className="absolute right-1.5 top-1.5 flex flex-col items-start gap-1">
          {pv.p.is_used && <Tag color="purple">مستعمل</Tag>}
          {compatible && <Tag color="teal">متوافق</Tag>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <div className="line-clamp-2 text-[14px] font-bold leading-5 lg:text-[15px]">{pv.p.name}</div>
        <div className="mt-auto space-y-0.5">
          <div className="flex items-baseline justify-between gap-1">
            <Money v={pv.p.sell_price} className="text-[17px] font-extrabold text-green" />
            {pv.p.min_sell_price + EPS < pv.p.sell_price && <Money v={pv.p.min_sell_price} currency={false} className="text-xs font-bold text-orange" />}
          </div>
          <div className="truncate text-xs font-bold">{qty}</div>
        </div>
      </div>
    </button>
  )
})

// ───────── كارت العرض ─────────

function OfferCard({ o }: { o: OfferView }) {
  const add = () => {
    if (!o.available) return toast('في منتج في العرض خلص', 'error')
    const lines = offerToLines(o)
    for (const l of lines) {
      const err = checkStock(l.variantId, l.qty)
      if (err) return toast(`${variantLabel(l.productName, l.variantName)}: ${err}`, 'error')
    }
    cart.addMany(lines)
    toast(`اتضاف عرض "${o.offer.name}" للسلة`, 'info', 1500)
  }
  return (
    <button type="button" onClick={add} className={cx('card p-4 text-right transition hover:border-primary/50', !o.available && 'opacity-50')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-purple-light text-purple">
            <Gift className="h-5 w-5" />
          </span>
          <div className="min-w-0 truncate text-lg font-extrabold">{o.offer.name}</div>
        </div>
        <Money v={o.offer.price} className="text-xl font-extrabold text-green" />
      </div>
      <div className="mt-2 text-sm leading-6 text-ink-2">{o.summary}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {o.saving > EPS && (
          <Tag color="green">
            توفير <Money v={o.saving} />
          </Tag>
        )}
        <Tag color="gray">
          بدل <Money v={o.normal} />
        </Tag>
        {!o.available && <Tag color="red">في منتج خلص</Tag>}
      </div>
    </button>
  )
}

// ───────── نافذة الإضافة للسلة ─────────

function AddToCart({ pv: initial, onClose }: { pv: ProductView; onClose: () => void }) {
  const pv = useShop((s) => s.byId.get(initial.p.id)) ?? initial
  const byId = useShop((s) => s.byId)
  const parts = useShop((s) => s.parts)
  const canDiscount = useCan('discount')
  const [variantId, setVariantId] = useState(() => firstSellable(initial).id)
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState(money(initial.p.sell_price).replace(/,/g, ''))
  const v: Variant = pv.vs.find((x) => x.id === variantId) ?? pv.vs[0]
  const p = pv.p

  // الشاحن وأجزاءه (لو المنتج بيتفك أو هو جزء من شاحن)
  const root = parts.byParent.has(p.id) ? pv : (parts.parentsOf.get(p.id) ?? []).map((id) => byId.get(id)).find(Boolean) ?? null
  const rootParts = root ? (parts.byParent.get(root.p.id) ?? []).map((e) => ({ pv: byId.get(e.partId), qty: e.qty })).filter((x) => x.pv) : []

  const extra = pv.vs.length === 1 ? extraAvailable(pv) : 0
  const avail = availableFor(v.id)
  const used = useCart((s) => s.lines.filter((l) => l.variantId === v.id).reduce((a, l) => a + l.qty, 0))
  const left = avail == null ? null : avail - used

  const qn = parseInt0(qty) ?? 0
  const pn = parseNum(price)
  let err: string | null = null
  if (qn <= 0) err = 'اكتب الكمية'
  else if (left != null && qn > left) err = left <= 0 ? 'الكمية المتاحة خلصت' : `الكمية المتاحة ${left} بس`
  else if (pn == null || pn <= 0) err = 'اكتب السعر'
  else if (pn + EPS < p.min_sell_price) err = `أقل سعر بيع ${money(p.min_sell_price)}`
  else if (!canDiscount && pn + EPS < p.sell_price) err = 'مش مسموحلك تقلل السعر. اطلب الصلاحية من المدير'

  const availText = (() => {
    if (v.uncounted) return 'لسه متجردش (متاح)'
    if (extra == null) return 'متاح'
    return extra > 0 ? `موجود ${v.stock} + يتفك ${extra}` : `موجود ${v.stock}`
  })()

  const add = () => {
    if (err) return
    cart.add(lineFrom(pv, v, qn, pn!))
    toast(`اتضاف ${variantLabel(p.name, v.name)} للسلة`, 'info', 1200)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={p.name}
      footer={
        <Button block onClick={add} disabled={!!err} icon={<ShoppingCart className="h-5 w-5" />}>
          إضافة للسلة {pn && qn > 0 ? `• ${money(roundMoney(pn * qn))} ج.م` : ''}
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="flex gap-3">
          <ProductImage url={p.image_url} className="h-20 w-20 shrink-0 rounded-btn" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap gap-1.5">
              <Tag color="green">
                سعر البيع <Money v={p.sell_price} />
              </Tag>
              <Tag color="orange">
                أقل سعر <Money v={p.min_sell_price} />
              </Tag>
              {p.is_used && <Tag color="purple">مستعمل</Tag>}
            </div>
            <div className="text-sm font-bold text-ink-2">{availText}</div>
            {p.imei && (
              <div className="text-xs text-ink-3" dir="ltr">
                IMEI: {p.imei}
              </div>
            )}
            {p.notes && <div className="text-xs text-ink-3">{p.notes}</div>}
          </div>
        </div>

        {pv.hasVariants && (
          <Field label="اللون">
            <div className="flex flex-wrap gap-2">
              {pv.vs.map((x) => {
                const ok = canSellVariant(x) || (pv.vs.length === 1 && (extra == null || extra > 0))
                return (
                  <button
                    key={x.id}
                    type="button"
                    disabled={!ok}
                    onClick={() => setVariantId(x.id)}
                    className={cx('chip', x.id === v.id && 'chip-on', !ok && 'opacity-40 line-through')}
                  >
                    {x.name ?? 'عادي'}
                    <span className={cx('text-xs', x.id === v.id ? 'text-white/80' : 'text-ink-3')}>{x.uncounted ? '؟' : x.stock}</span>
                  </button>
                )
              })}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <div className="flex items-center gap-1">
              <IconButton label="أقل" className="border border-line" onClick={() => setQty(String(Math.max(1, qn - 1)))}>
                <Minus className="h-5 w-5" />
              </IconButton>
              <NumInput decimal={false} className="text-center" value={qty} onChange={(e) => setQty(e.target.value)} />
              <IconButton label="أكتر" className="border border-line" onClick={() => setQty(String(qn + 1))}>
                <Plus className="h-5 w-5" />
              </IconButton>
            </div>
          </Field>
          <Field label="السعر للقطعة">
            <NumInput value={price} onChange={(e) => setPrice(e.target.value)} disabled={false} />
          </Field>
        </div>
        {err && qty !== '' && price !== '' && <div className="rounded-btn bg-red-light px-3 py-2 text-sm font-bold text-red">{err}</div>}
        {left != null && left > 0 && used > 0 && <div className="text-xs text-ink-3">في السلة {used} من نفس اللون</div>}

        {root && rootParts.length > 0 && (
          <div className="rounded-btn bg-purple-light/60 p-3 text-sm">
            <div className="mb-1 font-bold text-purple">الشاحن وأجزاءه</div>
            {[{ pv: root, qty: 0 }, ...rootParts].map((x) => (
              <div key={x.pv!.p.id} className="flex justify-between gap-2 py-0.5">
                <span className="truncate text-ink-2">
                  {x.qty ? `${x.pv!.p.name} × ${x.qty}` : x.pv!.p.name}
                </span>
                <span className="font-bold">{x.pv!.allUncounted ? 'لسه متجردش' : x.pv!.stock}</span>
              </div>
            ))}
            <div className="mt-1 text-xs text-ink-3">لو الجزء خلص، الشاحن بيتفك لوحده وقت البيع</div>
          </div>
        )}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  )
}

// ───────── السلة ─────────

function MobileCartBar({ onOpen }: { onOpen: () => void }) {
  const s = useCart()
  const t = totals(s)
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-3 pt-2 shadow-sheet backdrop-blur lg:hidden">
      <button type="button" onClick={onOpen} className={cx('mb-2 flex h-14 w-full items-center gap-3 rounded-btn px-4 text-white', t.count ? 'bg-primary' : 'bg-ink-3')}>
        <ShoppingCart className="h-6 w-6 shrink-0" />
        <span className="flex-1 text-right text-[16px] font-extrabold">
          السلة: <span className="num">{t.count}</span> قطعة
        </span>
        <Money v={t.total} className="text-lg font-extrabold" />
        <ChevronUp className="h-5 w-5" />
      </button>
    </div>
  )
}

function CartPanel({ inSheet, onDone }: { inSheet?: boolean; onDone?: () => void }) {
  const s = useCart()
  const t = totals(s)
  const canDiscount = useCan('discount')
  const canCredit = useCan('credit')
  const { data: customers } = useCustomers()
  const customer = customers?.find((c) => c.id === s.customerId) ?? null
  const variantById = useShop((st) => st.variantById)
  const [pickCustomer, setPickCustomer] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const held = useHeld()

  const editPrice = async (i: number) => {
    const l = s.lines[i]
    const v = await promptDialog({ title: 'سعر القطعة', label: variantLabel(l.productName, l.variantName), value: String(l.unitPrice), numeric: true })
    if (v == null) return
    const n = parseNum(v)
    if (n == null || n <= 0) return toast('اكتب السعر', 'error')
    if (n + EPS < l.minPrice) return toast(`أقل سعر بيع ${money(l.minPrice)}`, 'error')
    if (!canDiscount && n + EPS < l.basePrice) return toast('مش مسموحلك تقلل السعر. اطلب الصلاحية من المدير', 'error')
    cart.setPrice(i, n)
  }

  const inc = (i: number) => {
    const l = s.lines[i]
    const err = checkStock(l.variantId, l.qty + 1, i)
    if (err) return toast(err, 'error')
    cart.setQty(i, l.qty + 1)
  }

  const hold = async () => {
    if (!s.lines.length) return toast('السلة فاضية', 'error')
    const label = await promptDialog({ title: 'تعليق الفاتورة', label: 'اسم أو ملاحظة (اختياري)', placeholder: 'مثلاً: الأستاذ محمد', ok: 'تعليق' })
    if (label == null) return
    const ok = await run(
      () =>
        rpc('hold_cart', {
          p_data: { lines: s.lines, discount: t.discount, customerId: s.customerId },
          p_total: t.total,
          p_count: t.count,
          p_label: label.trim() || customer?.name || null,
        }),
      'تم تعليق الفاتورة',
    )
    if (ok) {
      cart.clear()
      onDone?.()
    }
  }

  const clear = async () => {
    if (!s.lines.length) return
    if (await confirmDialog({ title: 'تفريغ السلة', message: 'هتتشال كل المنتجات من السلة', ok: 'تفريغ', danger: true })) cart.clear()
  }

  return (
    <div className={cx('flex flex-col', inSheet ? '' : 'card h-full overflow-hidden')}>
      {!inSheet && (
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <div className="flex items-center gap-2 text-lg font-extrabold">
            <ShoppingCart className="h-5 w-5 text-primary" />
            السلة
            <span className="num text-sm text-ink-3">({t.count})</span>
          </div>
          {s.lines.length > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={clear}>
              تفريغ
            </Button>
          )}
        </div>
      )}

      <div className={cx('min-h-0', inSheet ? '' : 'flex-1 overflow-y-auto px-3 py-2')}>
        {s.lines.length === 0 ? (
          <Empty icon={<ShoppingCart />} text="السلة فاضية">
            <div className="text-sm">دوس على أي منتج عشان تضيفه</div>
          </Empty>
        ) : (
          <div className="divide-y divide-line-soft">
            {s.lines.map((l, i) => {
              const v = variantById.get(l.variantId)
              const avail = availableFor(l.variantId)
              const short = v && avail != null && l.qty > avail
              const changed = Math.abs(l.unitPrice - l.basePrice) > EPS
              return (
                <div key={`${l.variantId}-${l.unitPrice}-${l.offerName ?? ''}-${i}`} className="py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold leading-5">{variantLabel(l.productName, l.variantName)}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {l.offerName && <Tag color="purple">عرض: {l.offerName}</Tag>}
                        {short && <Tag color="red">المتاح {Math.max(0, avail!)} بس</Tag>}
                        {!v && <Tag color="red">المنتج اتشال</Tag>}
                      </div>
                    </div>
                    <button type="button" aria-label="حذف" className="icon-btn -mt-1 h-9 w-9 text-ink-3 hover:text-red" onClick={() => cart.remove(i)}>
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-btn border border-line">
                      <button type="button" aria-label="أقل" className="flex h-10 w-10 items-center justify-center text-ink-2" onClick={() => cart.setQty(i, l.qty - 1)}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="num w-8 text-center font-extrabold">{l.qty}</span>
                      <button type="button" aria-label="أكتر" className="flex h-10 w-10 items-center justify-center text-ink-2" onClick={() => inc(i)}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => editPrice(i)} className="flex min-h-10 flex-col items-end justify-center rounded-btn px-2 hover:bg-bg">
                      <Money v={roundMoney(l.unitPrice * l.qty)} className="font-extrabold" />
                      <span className={cx('text-xs', changed ? 'font-bold text-orange' : 'text-ink-3')}>
                        {l.qty > 1 && `${money(l.unitPrice)} للقطعة`}
                        {changed && <span className="line-through opacity-70"> {money(l.basePrice)}</span>}
                        {!changed && l.qty === 1 && 'دوس لتغيير السعر'}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={cx('space-y-3 border-t border-line-soft', inSheet ? 'mt-2 pt-3' : 'p-3')}>
        {canDiscount && s.lines.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm font-bold text-ink-2">خصم</span>
            <div className="w-28 shrink-0">
              <Segmented
                value={s.discMode}
                onChange={(m) => cart.setDiscount(m, s.discValue)}
                options={[
                  { value: 'amount', label: 'ج.م' },
                  { value: 'percent', label: '%' },
                ]}
              />
            </div>
            <NumInput
              className="h-10 lg:h-10"
              placeholder="0"
              value={s.discValue ? String(s.discValue) : ''}
              onChange={(e) => cart.setDiscount(s.discMode, parseNum(e.target.value) ?? 0)}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setPickCustomer(true)}
          className="flex min-h-11 w-full items-center gap-2 rounded-btn border border-dashed border-line px-3 text-right hover:bg-bg"
        >
          <UserRound className="h-5 w-5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-2">{customer ? customer.name : 'اختيار عميل (لازم للآجل)'}</span>
          {customer && customer.balance > EPS && (
            <span className="text-xs font-bold text-orange">
              عليه <Money v={customer.balance} />
            </span>
          )}
        </button>

        <div className="space-y-0.5 text-sm">
          <div className="flex justify-between text-ink-2">
            <span>المجموع</span>
            <Money v={t.subtotal} className="font-bold" />
          </div>
          {t.discount > 0 && (
            <div className="flex justify-between text-orange">
              <span>الخصم</span>
              <span className="font-bold">
                − <Money v={t.discount} />
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-extrabold">الإجمالي</span>
            <Money v={t.total} className="text-2xl font-extrabold text-primary" />
          </div>
          {t.discountTooBig && <div className="rounded-btn bg-red-light px-3 py-2 text-xs font-bold text-red">الخصم كبير: الإجمالي مينفعش يقل عن {money(t.minTotal)} (مجموع أقل أسعار البيع)</div>}
        </div>

        <Button block className="h-12" disabled={!s.lines.length || t.discountTooBig} onClick={() => setCheckout(true)}>
          إتمام عملية البيع
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" icon={<PauseCircle className="h-4 w-4" />} onClick={hold} disabled={!s.lines.length}>
            تعليق الفاتورة
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
            المعلقة ({held.data?.length ?? 0})
          </Button>
        </div>
        {inSheet && s.lines.length > 0 && (
          <Button variant="ghost" size="sm" block icon={<Trash2 className="h-4 w-4" />} onClick={clear}>
            تفريغ السلة
          </Button>
        )}
      </div>

      <CustomerPicker open={pickCustomer} onClose={() => setPickCustomer(false)} value={s.customerId} onPick={(c) => cart.setCustomer(c?.id ?? null)} />
      {checkout && <Checkout canCredit={canCredit} customerName={customer?.name ?? null} onClose={() => setCheckout(false)} onDone={onDone} />}
      {heldOpen && <HeldList held={held.data ?? []} onClose={() => setHeldOpen(false)} onResumed={onDone} />}
    </div>
  )
}

// ───────── إتمام البيع ─────────

function Checkout({ canCredit, customerName, onClose, onDone }: { canCredit: boolean; customerName: string | null; onClose: () => void; onDone?: () => void }) {
  const s = useCart()
  const t = totals(s)
  const [paid, setPaid] = useState(money(t.total).replace(/,/g, ''))
  const [note, setNote] = useState(s.note)
  const pn = parseNum(paid) ?? 0
  const change = roundMoney(pn - t.total)
  const debt = roundMoney(t.total - pn)
  let err: string | null = null
  if (pn < 0) err = 'المبلغ المدفوع غلط'
  else if (debt > EPS && !canCredit) err = 'مش مسموحلك تبيع آجل. لازم العميل يدفع الإجمالي كله'
  else if (debt > EPS && !s.customerId) err = 'اختار العميل عشان الباقي يتسجل عليه آجل'

  const confirmSale = () => {
    if (err) return
    // البيع بيبان فوري: نفضّي السلة ونقفل، ولو السيرفر رفض نرجّع السلة زي ما كانت
    const snap = cart.snapshot()
    const offersNote = [...new Set(snap.lines.map((l) => l.offerName).filter(Boolean))]
    const fullNote = [offersNote.length ? `عروض: ${offersNote.join('، ')}` : '', note.trim()].filter(Boolean).join(' - ')
    const payload = {
      lines: snap.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty, unit_price: l.unitPrice })),
      discount: t.discount,
      paid: roundMoney(Math.min(pn, t.total)),
      customer_id: snap.customerId,
      note: fullNote || null,
    }
    cart.clear()
    onClose()
    onDone?.()
    rpc<{ id: number; no: number; total: number }>('complete_sale', { p: payload })
      .then((r) => toast(`تم حفظ الفاتورة رقم #${r.no}${change > EPS ? `\nالباقي للعميل ${money(change)} ج.م` : ''}`))
      .catch((e) => {
        const cur = useCart.getState()
        cart.restore({ ...snap, note, lines: [...snap.lines, ...cur.lines] })
        toastError(e)
      })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="إتمام البيع"
      footer={
        <div className="flex gap-2">
          <Button variant="green" className="h-12 flex-1 text-lg" disabled={!!err} onClick={confirmSale}>
            تأكيد البيع
          </Button>
          <Button variant="outline" className="h-12" onClick={onClose}>
            رجوع
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          confirmSale()
        }}
      >
        <div className="rounded-card bg-primary-light p-4 text-center">
          <div className="text-sm font-bold text-primary">المطلوب</div>
          <Money v={t.total} className="text-4xl font-extrabold text-primary" />
          <div className="mt-1 text-xs text-ink-3">
            {t.count} قطعة{t.discount > 0 ? ` • خصم ${money(t.discount)}` : ''}
            {customerName ? ` • ${customerName}` : ''}
          </div>
        </div>
        <Field label="المدفوع كاش">
          <NumInput autoFocus className="h-14 text-2xl font-extrabold lg:h-14" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[t.total, 50, 100, 200, 500, 1000].filter((x, i, a) => x >= t.total && a.indexOf(x) === i).slice(0, 5).map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setPaid(String(x))}>
              {money(x)}
            </button>
          ))}
        </div>
        {change > EPS && (
          <div className="flex items-center justify-between rounded-btn bg-green-light px-4 py-3">
            <span className="font-bold text-green">الباقي للعميل</span>
            <Money v={change} className="text-2xl font-extrabold text-green" />
          </div>
        )}
        {debt > EPS && (
          <div className="flex items-center justify-between rounded-btn bg-orange-light px-4 py-3">
            <span className="font-bold text-orange">آجل على {customerName ?? 'العميل'}</span>
            <Money v={debt} className="text-2xl font-extrabold text-orange" />
          </div>
        )}
        {err && <div className="rounded-btn bg-red-light px-3 py-2 text-sm font-bold text-red">{err}</div>}
        <Field label="ملاحظات (اختياري)">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  )
}

// ───────── الفواتير المعلقة ─────────

function useHeld() {
  return useLive('held', ['held_carts'], async () => {
    const rows = await fetchAll<HeldCart>(() => supabase.from('held_carts').select().order('id', { ascending: false }))
    return rows.map((r) => nums(r, ['total']))
  })
}

function HeldList({ held, onClose, onResumed }: { held: HeldCart[]; onClose: () => void; onResumed?: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const take = async (h: HeldCart, resume: boolean) => {
    if (resume && useCart.getState().lines.length) {
      const ok = await confirmDialog({ title: 'استكمال فاتورة معلقة', message: 'السلة فيها منتجات. منتجات الفاتورة المعلقة هتتضاف عليها.', ok: 'استكمال' })
      if (!ok) return
    }
    if (!resume && !(await confirmDialog({ title: 'حذف الفاتورة المعلقة', message: `هتتحذف الفاتورة ${h.label ?? 'H' + h.id}`, ok: 'حذف', danger: true }))) return
    setBusy(h.id)
    try {
      const data = await rpc<HeldCart['data']>('take_held', { p_id: h.id, p_resume: resume })
      if (resume) {
        const lines = (data?.lines ?? []).map((l) => ({ ...l, unitPrice: Number(l.unitPrice), qty: Number(l.qty) }))
        cart.addMany(lines)
        if (data?.customerId) cart.setCustomer(data.customerId)
        const disc = Number(data?.discount) || 0
        if (disc > 0) cart.setDiscount('amount', disc)
        toast('تم استكمال الفاتورة المعلقة')
        onClose()
        onResumed?.()
      } else {
        toast('تم حذف الفاتورة المعلقة')
      }
    } catch (e) {
      toastError(e)
    }
    setBusy(null)
  }
  return (
    <Modal open onClose={onClose} title={`الفواتير المعلقة (${held.length})`}>
      {held.length === 0 ? (
        <Empty icon={<PauseCircle />} text="مفيش فواتير معلقة" />
      ) : (
        <div className="space-y-2">
          {held.map((h) => (
            <div key={h.id} className="rounded-card border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-extrabold">{h.label || `H${h.id}`}</div>
                  <div className="text-xs text-ink-3">
                    {h.items_count} قطعة • {dateTimeFmt(h.created_at)}
                    {h.user_name ? ` • ${h.user_name}` : ''}
                  </div>
                </div>
                <Money v={h.total} className="font-extrabold text-primary" />
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-ink-2">{(h.data?.lines ?? []).map((l) => variantLabel(l.productName, l.variantName) + (l.qty > 1 ? ` × ${l.qty}` : '')).join('، ')}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" loading={busy === h.id} onClick={() => take(h, true)}>
                  استكمال
                </Button>
                <Button size="sm" variant="danger-soft" disabled={busy === h.id} onClick={() => take(h, false)}>
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
