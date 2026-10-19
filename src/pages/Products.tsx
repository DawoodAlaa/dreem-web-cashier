import { AlertTriangle, Boxes, Check, ListChecks, Gift, MoreVertical, PackagePlus, Pencil, Plus, Puzzle, Smartphone, Split, Tags, Trash2, UserRound, Wrench, Zap, Combine } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CategoryForm } from '@/components/CategoryForm'
import { CategoryIcon } from '@/components/icons'
import { LossForm } from '@/components/LossForm'
import { ImagePicker, ProductForm, ProductImage } from '@/components/ProductForm'
import { ProductPicker } from '@/components/ProductPicker'
import { Button, Checkbox, Empty, Field, IconButton, Input, KV, Loading, Modal, Money, NumInput, PageHeader, SearchBox, Select, Tag, confirmDialog, cx, promptDialog } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { q as one, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { offerView } from '@/lib/cart'
import { EPS, dateTimeFmt, money, norm, parseInt0, parseNum } from '@/lib/format'
import { splitCategories, useShop } from '@/lib/shop'
import { supabase } from '@/lib/supabase'
import { run, toast } from '@/lib/toast'
import type { Category, Offer, ProductView, UsedPurchase } from '@/lib/types'
import { useLive } from '@/lib/useLive'

const ALL = -1

function useLongPress(onLong: () => void, ms = 550) {
  const t = useRef(0)
  const fired = useRef(false)
  const start = () => {
    fired.current = false
    t.current = window.setTimeout(() => {
      fired.current = true
      onLong()
    }, ms)
  }
  const cancel = () => clearTimeout(t.current)
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      onLong()
    },
    wasLong: () => fired.current,
  }
}

function CatChip({ c, on, count, onClick, onLong }: { c: Category; on: boolean; count: number; onClick: () => void; onLong?: () => void }) {
  const lp = useLongPress(() => onLong?.())
  const { wasLong, ...handlers } = lp
  return (
    <button type="button" className={cx('chip select-none', on && 'chip-on')} {...(onLong ? handlers : {})} onClick={() => !wasLong() && onClick()}>
      <CategoryIcon icon={c.icon} className="h-4 w-4" />
      {c.name}
      <span className={cx('num text-xs', on ? 'text-white/80' : 'text-ink-3')}>{count}</span>
    </button>
  )
}

type Dialog =
  | { k: 'add' }
  | { k: 'edit'; pv: ProductView }
  | { k: 'quick' }
  | { k: 'used' }
  | { k: 'bulk' }
  | { k: 'offers' }
  | { k: 'stock'; pv: ProductView }
  | { k: 'loss'; pv: ProductView }
  | { k: 'parts'; pv: ProductView }
  | { k: 'usedInfo'; pv: ProductView }
  | { k: 'cat'; c: Category | null }
  | null

export default function ProductsPage() {
  const views = useShop((s) => s.views)
  const categories = useShop((s) => s.categories)
  const canProducts = useCan('products')
  const canStock = useCan('stock')
  const canUsed = useCan('used')
  const [cat, setCat] = useState(ALL)
  const [q, setQ] = useState('')
  const [low, setLow] = useState(false)
  const [unc, setUnc] = useState(false)
  const [dlg, setDlg] = useState<Dialog>(null)
  const [tools, setTools] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const v of views) m.set(v.p.category_id, (m.get(v.p.category_id) ?? 0) + 1)
    return m
  }, [views])

  const list = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean)
    return views.filter((v) => {
      if (cat !== ALL && v.p.category_id !== cat) return false
      if (low && !v.isLow) return false
      if (unc && !v.uncounted) return false
      return tokens.every((t) => v.key.includes(t))
    })
  }, [views, cat, q, low, unc])

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allOn = list.length > 0 && list.every((v) => sel.has(v.p.id))
  const toggleAll = () =>
    setSel((s) => {
      const n = new Set(s)
      if (allOn) list.forEach((v) => n.delete(v.p.id))
      else list.forEach((v) => n.add(v.p.id))
      return n
    })
  const stopSelecting = () => {
    setSelecting(false)
    setSel(new Set())
  }
  const catName = cat !== ALL ? categories.find((c) => c.id === cat)?.name : null
  const deleteSelected = async () => {
    const ids = [...sel].filter((id) => views.some((v) => v.p.id === id))
    if (!ids.length) return
    const ok = await confirmDialog({
      title: `حذف ${ids.length} منتج`,
      message: `هيتحذف ${ids.length} منتج من المنتجات.\nتقدر ترجّعهم كلهم مرة واحدة من السجل (تراجع).`,
      ok: 'حذف',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    let n = 0
    const done = await run(async () => {
      n = Number(await rpc('archive_products', { p_ids: ids }))
    })
    setDeleting(false)
    if (done) {
      toast(`تم حذف ${n} منتج`)
      stopSelecting()
    }
  }

  const lowCount = useMemo(() => views.filter((v) => v.isLow).length, [views])
  const uncCount = useMemo(() => views.filter((v) => v.uncounted).length, [views])

  return (
    <div>
      <PageHeader
        title="المنتجات"
        sub={`${list.length} منتج`}
        actions={
          <>
            {canProducts && (
              <Button icon={<Plus className="h-5 w-5" />} onClick={() => setDlg({ k: 'add' })}>
                إضافة منتج
              </Button>
            )}
            {canProducts && (
              <Button variant="soft" icon={<Zap className="h-5 w-5" />} onClick={() => setDlg({ k: 'quick' })}>
                إضافة سريعة
              </Button>
            )}
            {(canProducts || canUsed) && (
              <Button variant="outline" icon={<Wrench className="h-5 w-5" />} onClick={() => setTools(true)}>
                أدوات
              </Button>
            )}
            {canProducts && (
              <Button variant={selecting ? 'soft' : 'outline'} icon={<ListChecks className="h-5 w-5" />} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                {selecting ? 'إلغاء التحديد' : 'تحديد'}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={cx('chip', cat === ALL && 'chip-on')} onClick={() => setCat(ALL)}>
            الكل <span className={cx('num text-xs', cat === ALL ? 'text-white/80' : 'text-ink-3')}>{views.length}</span>
          </button>
          {categories.map((c) => (
            <CatChip key={c.id} c={c} on={cat === c.id} count={counts.get(c.id) ?? 0} onClick={() => setCat(c.id)} onLong={canProducts ? () => setDlg({ k: 'cat', c }) : undefined} />
          ))}
          {canProducts && (
            <button type="button" className="chip border-dashed text-primary" onClick={() => setDlg({ k: 'cat', c: null })}>
              <Plus className="h-4 w-4" /> صنف
            </button>
          )}
        </div>
        {canProducts && <div className="text-xs text-ink-3">اضغط ضغطة طويلة على الصنف عشان تعدّله أو تحذفه</div>}
        <div className="flex flex-wrap gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="بحث بالاسم أو IMEI" className="min-w-[200px] flex-1" />
          <button type="button" className={cx('chip', low && 'chip-on')} onClick={() => setLow((x) => !x)}>
            <AlertTriangle className="h-4 w-4" /> قربت تخلص ({lowCount})
          </button>
          <button type="button" className={cx('chip', unc && 'chip-on')} onClick={() => setUnc((x) => !x)}>
            لسه متجردش ({uncCount})
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<Boxes />} text={views.length ? 'مفيش منتجات مطابقة' : 'مفيش منتجات لسه. ابدأ بإضافة منتج'} />
      ) : (
        <div className={selecting ? 'pb-32' : undefined}>
          <VirtualList
            items={list}
            estimate={128}
            getKey={(v) => v.p.id}
            render={(v) => (
              <ProductRow pv={v} onAction={setDlg} canProducts={canProducts} canStock={canStock} selecting={selecting} selected={sel.has(v.p.id)} onToggle={() => toggle(v.p.id)} />
            )}
          />
        </div>
      )}

      {selecting && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 shadow-sheet backdrop-blur lg:right-[248px]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-3 py-3 lg:px-6">
            <span className="text-[15px] font-extrabold">
              <span className="num">{sel.size}</span> محدد
            </span>
            <Button size="sm" variant="soft" onClick={toggleAll} disabled={!list.length}>
              {allOn ? 'شيل تحديد الكل' : catName ? `تحديد كل ${catName} (${list.length})` : `تحديد الكل (${list.length})`}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={deleting} disabled={!sel.size} onClick={deleteSelected}>
              حذف{sel.size ? ` (${sel.size})` : ''}
            </Button>
          </div>
        </div>
      )}

      <Modal open={tools} onClose={() => setTools(false)} title="أدوات" size="sm">
        <div className="space-y-2">
          {canUsed && (
            <ToolButton icon={<Smartphone />} title="شراء موبايل مستعمل" sub="بيتسجل منتج جديد وبيتخصم سعره من الدرج" onClick={() => (setTools(false), setDlg({ k: 'used' }))} />
          )}
          {canProducts && <ToolButton icon={<Tags />} title="تعديل أسعار مجموعة" sub="غيّر أسعار كذا منتج مرة واحدة" onClick={() => (setTools(false), setDlg({ k: 'bulk' }))} />}
          {canProducts && <ToolButton icon={<Gift />} title="العروض والباكدجات" sub="مجموعة منتجات بسعر واحد" onClick={() => (setTools(false), setDlg({ k: 'offers' }))} />}
        </div>
      </Modal>

      {dlg?.k === 'add' && <ProductForm open defaultCategory={cat !== ALL ? cat : null} onClose={() => setDlg(null)} />}
      {dlg?.k === 'edit' && <ProductForm open product={dlg.pv} onClose={() => setDlg(null)} />}
      {dlg?.k === 'quick' && <QuickAdd defaultCategory={cat !== ALL ? cat : null} onClose={() => setDlg(null)} />}
      {dlg?.k === 'used' && <BuyUsed onClose={() => setDlg(null)} />}
      {dlg?.k === 'bulk' && <BulkPrices onClose={() => setDlg(null)} />}
      {dlg?.k === 'offers' && <Offers onClose={() => setDlg(null)} />}
      {dlg?.k === 'stock' && <AddStock pv={dlg.pv} onClose={() => setDlg(null)} />}
      {dlg?.k === 'loss' && <LossForm open initial={{ pv: dlg.pv, v: dlg.pv.vs[0] }} onClose={() => setDlg(null)} />}
      {dlg?.k === 'parts' && <PartsEditor pv={dlg.pv} onClose={() => setDlg(null)} />}
      {dlg?.k === 'usedInfo' && <UsedInfo pv={dlg.pv} onClose={() => setDlg(null)} />}
      {dlg?.k === 'cat' && <CategoryForm open category={dlg.c} onClose={() => setDlg(null)} />}
    </div>
  )
}

function ToolButton({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-btn border border-line p-3 text-right hover:border-primary">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-primary-light text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span>
        <span className="block font-extrabold">{title}</span>
        <span className="block text-xs text-ink-3">{sub}</span>
      </span>
    </button>
  )
}

// ───────── كارت المنتج ─────────

function ProductRow({
  pv,
  onAction,
  canProducts,
  canStock,
  selecting,
  selected,
  onToggle,
}: {
  pv: ProductView
  onAction: (d: Dialog) => void
  canProducts: boolean
  canStock: boolean
  selecting: boolean
  selected: boolean
  onToggle: () => void
}) {
  const showCost = useCan('reports')
  const icon = useShop((s) => s.categories.find((c) => c.id === pv.p.category_id)?.icon ?? 'box')
  const hasParts = useShop((s) => (s.parts.byParent.get(pv.p.id)?.length ?? 0) > 0)
  const isSplitCat = useShop((s) => splitCategories(s.settings, s.categories).includes(pv.p.category_id))
  const [menu, setMenu] = useState(false)
  const p = pv.p

  const doSplit = async (assemble: boolean) => {
    setMenu(false)
    const v = await promptDialog({ title: assemble ? 'تجميع' : 'فك', label: 'العدد', value: '1', numeric: true, ok: assemble ? 'تجميع' : 'فك' })
    const n = v == null ? null : parseInt0(v)
    if (!n || n <= 0) return
    await run(() => rpc(assemble ? 'assemble_product' : 'split_product', { p_product: p.id, p_count: n }), assemble ? 'تم التجميع' : 'تم الفك')
  }
  const del = async () => {
    setMenu(false)
    if (!(await confirmDialog({ title: 'حذف المنتج', message: `هيتحذف "${p.name}" من المنتجات. تقدر تتراجع من السجل.`, ok: 'حذف', danger: true }))) return
    await run(() => rpc('archive_product', { p_id: p.id }), 'تم حذف المنتج')
  }

  const items: { label: string; icon: React.ReactNode; on: () => void; show: boolean; danger?: boolean }[] = [
    { label: 'تعديل', icon: <Pencil className="h-4 w-4" />, on: () => onAction({ k: 'edit', pv }), show: canProducts },
    { label: 'هالك', icon: <AlertTriangle className="h-4 w-4" />, on: () => onAction({ k: 'loss', pv }), show: canStock },
    { label: 'المكونات (راس + وصلة)', icon: <Puzzle className="h-4 w-4" />, on: () => onAction({ k: 'parts', pv }), show: canProducts && (isSplitCat || hasParts) },
    { label: 'فك', icon: <Split className="h-4 w-4" />, on: () => doSplit(false), show: canStock && hasParts },
    { label: 'تجميع', icon: <Combine className="h-4 w-4" />, on: () => doSplit(true), show: canStock && hasParts },
    { label: 'بيانات المستعمل', icon: <UserRound className="h-4 w-4" />, on: () => onAction({ k: 'usedInfo', pv }), show: p.is_used },
    { label: 'حذف', icon: <Trash2 className="h-4 w-4" />, on: del, show: canProducts, danger: true },
  ]

  return (
    <div
      className={cx('card flex gap-3 p-3', pv.outOfStock && !selecting && 'opacity-70', selecting && 'cursor-pointer select-none', selected && 'border-primary bg-primary-light/40 ring-2 ring-primary/20')}
      onClick={selecting ? onToggle : undefined}
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? selected : undefined}
    >
      {selecting && (
        <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full border-2', selected ? 'border-primary bg-primary text-white' : 'border-line bg-white')}>
          {selected && <Check className="h-4 w-4" />}
        </span>
      )}
      <ProductImage url={p.image_url} className="h-20 w-20 shrink-0 rounded-btn lg:h-24 lg:w-24" icon={<CategoryIcon icon={icon} className="h-8 w-8 opacity-40" />} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-extrabold">{p.name}</span>
              {p.is_used && <Tag color="purple">مستعمل</Tag>}
              {hasParts && <Tag color="purple">بيتفك</Tag>}
            </div>
            {p.imei && (
              <div className="text-xs text-ink-3" dir="ltr">
                IMEI {p.imei}
              </div>
            )}
          </div>
          <div className={cx('relative flex shrink-0 items-center gap-1', selecting && 'hidden')}>
            {canStock && (
              <Button size="sm" variant="soft" className="h-9 px-2.5" icon={<PackagePlus className="h-4 w-4" />} onClick={() => onAction({ k: 'stock', pv })}>
                كمية
              </Button>
            )}
            {items.some((i) => i.show) && (
              <IconButton label="خيارات" onClick={() => setMenu((m) => !m)} className="h-9 w-9">
                <MoreVertical className="h-5 w-5" />
              </IconButton>
            )}
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="anim-pop absolute left-0 top-10 z-40 w-52 rounded-card border border-line bg-white p-1.5 shadow-xl">
                  {items
                    .filter((i) => i.show)
                    .map((i) => (
                      <button
                        key={i.label}
                        type="button"
                        className={cx('flex h-10 w-full items-center gap-2 rounded-btn px-2 text-sm font-bold', i.danger ? 'text-red hover:bg-red-light' : 'text-ink-2 hover:bg-bg')}
                        onClick={() => {
                          setMenu(false)
                          i.on()
                        }}
                      >
                        {i.icon}
                        {i.label}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
          {showCost && (
            <span className="text-ink-3">
              جملة <Money v={p.cost_price} className="font-bold text-ink-2" />
            </span>
          )}
          <span className="text-ink-3">
            بيع <Money v={p.sell_price} className="font-bold text-green" />
          </span>
          <span className="text-ink-3">
            أقل <Money v={p.min_sell_price} className="font-bold text-orange" />
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {pv.allUncounted ? (
            <Tag color="orange">لسه متجردش</Tag>
          ) : (
            <Tag color={pv.stock <= 0 ? 'red' : pv.isLow ? 'orange' : 'gray'}>الكمية {pv.stock}</Tag>
          )}
          <span className="text-ink-3">حد التنبيه {p.min_stock}</span>
          {pv.hasVariants &&
            pv.vs.map((v) => (
              <Tag key={v.id} color={v.uncounted ? 'orange' : v.stock <= 0 ? 'red' : 'gray'}>
                {v.name}: {v.uncounted ? '؟' : v.stock}
              </Tag>
            ))}
        </div>
      </div>
    </div>
  )
}

// ───────── + كمية (توريد) ─────────

function AddStock({ pv, onClose }: { pv: ProductView; onClose: () => void }) {
  const [qty, setQty] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const items = pv.vs.map((v) => ({ variant_id: v.id, qty: parseInt0(qty[v.id] ?? '') ?? 0 })).filter((x) => x.qty !== 0)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('add_stock', { p_items: items }), 'تم إضافة الكمية')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`إضافة كمية — ${pv.p.name}`}
      footer={
        <Button block loading={busy} disabled={!items.length} onClick={save}>
          إضافة
        </Button>
      }
    >
      <div className="space-y-3">
        {pv.vs.map((v) => (
          <div key={v.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{v.name ?? 'الكمية الجديدة'}</div>
              <div className="text-xs text-ink-3">{v.uncounted ? 'لسه متجردش' : `الموجود ${v.stock}`}</div>
            </div>
            <NumInput decimal={false} className="w-28" placeholder="0" autoFocus={pv.vs.length === 1} value={qty[v.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [v.id]: e.target.value }))} />
          </div>
        ))}
        <div className="text-xs text-ink-3">لو اشتريت من تاجر، الأفضل تسجلها من صفحة المشتريات عشان حساب التاجر يتظبط</div>
      </div>
    </Modal>
  )
}

// ───────── إضافة سريعة ─────────

function QuickAdd({ defaultCategory, onClose }: { defaultCategory: number | null; onClose: () => void }) {
  const categories = useShop((s) => s.categories)
  const showCost = useCan('reports')
  const [cat, setCat] = useState(defaultCategory ?? categories.find((c) => c.icon === 'case')?.id ?? categories[0]?.id ?? 0)
  const [cost, setCost] = useState('')
  const [sell, setSell] = useState('')
  const [minSell, setMinSell] = useState('')
  const [minStock, setMinStock] = useState('1')
  const [image, setImage] = useState<string | null>(null)
  const [uncounted, setUncounted] = useState(false)
  const [rows, setRows] = useState([{ name: '', qty: '1' }])
  const [busy, setBusy] = useState(false)
  const items = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), qty: parseInt0(r.qty) ?? 0 }))
  const sellN = parseNum(sell)
  const save = async () => {
    setBusy(true)
    let n = 0
    const ok = await run(async () => {
      n = Number(
        await rpc('quick_add', {
          p: {
            category_id: cat,
            cost: parseNum(cost) ?? 0,
            sell: sellN,
            min_sell: parseNum(minSell) ?? sellN,
            min_stock: parseInt0(minStock) ?? 0,
            image_url: image,
            uncounted,
            items,
          },
        }),
      )
    })
    setBusy(false)
    if (ok) {
      toast(`تم إضافة ${n || items.length} منتج`)
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="إضافة سريعة"
      footer={
        <Button block loading={busy} disabled={!items.length || !sellN} onClick={save}>
          إضافة {items.length} منتج
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-ink-3">أكتر من منتج بنفس الأسعار (زي الجرابات). اكتب اسم كل منتج وكميته.</div>
        <Field label="الصنف">
          <Select value={cat} onChange={(e) => setCat(Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={cx('grid gap-3', showCost ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
          {showCost && (
            <Field label="سعر الجملة">
              <NumInput value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          )}
          <Field label="سعر البيع">
            <NumInput value={sell} onChange={(e) => setSell(e.target.value)} />
          </Field>
          <Field label="أقل سعر">
            <NumInput value={minSell} placeholder={sell} onChange={(e) => setMinSell(e.target.value)} />
          </Field>
          <Field label="حد التنبيه">
            <NumInput decimal={false} value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </Field>
        </div>
        <Field label="صورة (للكل)">
          <ImagePicker value={image} onChange={setImage} />
        </Field>
        <Checkbox checked={uncounted} onChange={setUncounted} label="الكمية هتتجرد بعدين" />
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="flex-1"
                placeholder={`اسم المنتج ${i + 1}`}
                value={r.name}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (i === rows.length - 1) setRows((x) => [...x, { name: '', qty: r.qty }])
                  }
                }}
              />
              {!uncounted && (
                <NumInput decimal={false} className="w-20" value={r.qty} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
              )}
              <IconButton label="حذف" className="text-red" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))}>
                <Trash2 className="h-5 w-5" />
              </IconButton>
            </div>
          ))}
          <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((x) => [...x, { name: '', qty: x[x.length - 1]?.qty ?? '1' }])}>
            منتج تاني
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ───────── شراء موبايل مستعمل ─────────

function BuyUsed({ onClose }: { onClose: () => void }) {
  const categories = useShop((s) => s.categories)
  const [f, setF] = useState({
    category_id: categories.find((c) => c.icon === 'used')?.id ?? categories[0]?.id ?? 0,
    device_name: '',
    price: '',
    sell: '',
    min_sell: '',
    seller_name: '',
    seller_phone: '',
    seller_id_number: '',
    imei: '',
    condition: '',
  })
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const save = async () => {
    setBusy(true)
    const sell = parseNum(f.sell)
    const ok = await run(
      () =>
        rpc('buy_used', {
          p: {
            category_id: Number(f.category_id),
            device_name: f.device_name.trim(),
            price: parseNum(f.price),
            sell,
            min_sell: parseNum(f.min_sell) ?? sell,
            seller_name: f.seller_name.trim(),
            seller_phone: f.seller_phone.trim() || null,
            seller_id_number: f.seller_id_number.trim() || null,
            imei: f.imei.trim() || null,
            condition: f.condition.trim() || null,
            image_url: image,
          },
        }),
      'تم تسجيل شراء الموبايل المستعمل',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="شراء موبايل مستعمل"
      footer={
        <Button block loading={busy} disabled={!f.device_name.trim() || !f.seller_name.trim() || !parseNum(f.price) || !parseNum(f.sell)} onClick={save}>
          تسجيل الشراء (هيتخصم من الدرج)
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الصنف">
            <Select value={f.category_id} onChange={set('category_id')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="اسم الجهاز">
            <Input value={f.device_name} onChange={set('device_name')} placeholder="مثلاً: iPhone 12 128GB" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="سعر الشراء">
            <NumInput value={f.price} onChange={set('price')} />
          </Field>
          <Field label="سعر البيع">
            <NumInput value={f.sell} onChange={set('sell')} />
          </Field>
          <Field label="أقل سعر">
            <NumInput value={f.min_sell} placeholder={f.sell} onChange={set('min_sell')} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="IMEI">
            <Input dir="ltr" className="text-right" value={f.imei} onChange={set('imei')} />
          </Field>
          <Field label="حالة الجهاز">
            <Input value={f.condition} onChange={set('condition')} placeholder="مثلاً: بطارية 85%، خدش بسيط" />
          </Field>
        </div>
        <div className="rounded-card border border-line p-3">
          <div className="mb-2 font-extrabold">بيانات البائع</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="الاسم">
              <Input value={f.seller_name} onChange={set('seller_name')} />
            </Field>
            <Field label="التليفون">
              <Input type="tel" dir="ltr" className="text-right" value={f.seller_phone} onChange={set('seller_phone')} />
            </Field>
            <Field label="رقم البطاقة">
              <Input dir="ltr" inputMode="numeric" className="text-right" value={f.seller_id_number} onChange={set('seller_id_number')} />
            </Field>
          </div>
        </div>
        <Field label="صورة الجهاز">
          <ImagePicker value={image} onChange={setImage} />
        </Field>
      </div>
    </Modal>
  )
}

function UsedInfo({ pv, onClose }: { pv: ProductView; onClose: () => void }) {
  const live = useLive(`used:${pv.p.id}`, [], async () => {
    const rows = (await one(supabase.from('used_purchases').select().eq('product_id', pv.p.id).eq('voided', false).limit(1))) as UsedPurchase[]
    return rows[0] ?? null
  })
  const u = live.data
  return (
    <Modal open onClose={onClose} size="sm" title={`بيانات المستعمل — ${pv.p.name}`}>
      {live.loading ? (
        <Loading />
      ) : !u ? (
        <Empty text="مفيش بيانات شراء للجهاز ده" />
      ) : (
        <div>
          <KV k="البائع" v={u.seller_name} />
          {u.seller_phone && <KV k="التليفون" v={<span dir="ltr">{u.seller_phone}</span>} />}
          {u.seller_id_number && <KV k="رقم البطاقة" v={<span dir="ltr">{u.seller_id_number}</span>} />}
          {u.imei && <KV k="IMEI" v={<span dir="ltr">{u.imei}</span>} />}
          {u.condition && <KV k="الحالة" v={u.condition} />}
          <KV k="سعر الشراء" v={<Money v={Number(u.price)} />} />
          <KV k="التاريخ" v={dateTimeFmt(u.created_at)} />
        </div>
      )}
    </Modal>
  )
}

// ───────── تعديل أسعار مجموعة ─────────

function BulkPrices({ onClose }: { onClose: () => void }) {
  const views = useShop((s) => s.views)
  const categories = useShop((s) => s.categories)
  const showCost = useCan('reports')
  const [cat, setCat] = useState(ALL)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [cost, setCost] = useState('')
  const [sell, setSell] = useState('')
  const [minSell, setMinSell] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean)
    return views.filter((v) => (cat === ALL || v.p.category_id === cat) && t.every((x) => v.key.includes(x)))
  }, [views, cat, q])
  const allOn = list.length > 0 && list.every((v) => sel.has(v.p.id))
  const toggleAll = () =>
    setSel((s) => {
      const n = new Set(s)
      if (allOn) list.forEach((v) => n.delete(v.p.id))
      else list.forEach((v) => n.add(v.p.id))
      return n
    })
  const save = async () => {
    setBusy(true)
    const label = cat !== ALL ? categories.find((c) => c.id === cat)?.name : q.trim() || null
    let n = 0
    const ok = await run(async () => {
      n = Number(
        await rpc('bulk_update_prices', {
          p_ids: [...sel],
          p_cost: cost.trim() ? parseNum(cost) : null,
          p_sell: sell.trim() ? parseNum(sell) : null,
          p_min: minSell.trim() ? parseNum(minSell) : null,
          p_label: label ?? null,
        }),
      )
    })
    setBusy(false)
    if (ok) {
      toast(`تم تعديل أسعار ${n} منتج`)
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="تعديل أسعار مجموعة"
      footer={
        <div className="space-y-2">
          <div className={cx('grid gap-2', showCost ? 'grid-cols-3' : 'grid-cols-2')}>
            {showCost && (
              <Field label="جملة جديد">
                <NumInput value={cost} placeholder="متتغيرش" onChange={(e) => setCost(e.target.value)} />
              </Field>
            )}
            <Field label="بيع جديد">
              <NumInput value={sell} placeholder="متتغيرش" onChange={(e) => setSell(e.target.value)} />
            </Field>
            <Field label="أقل سعر جديد">
              <NumInput value={minSell} placeholder="متتغيرش" onChange={(e) => setMinSell(e.target.value)} />
            </Field>
          </div>
          <Button block loading={busy} disabled={!sel.size || (!cost.trim() && !sell.trim() && !minSell.trim())} onClick={save}>
            تعديل أسعار {sel.size} منتج
          </Button>
        </div>
      }
    >
      <div className="mb-3 space-y-2">
        <Select value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          <option value={ALL}>كل الأصناف</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <SearchBox value={q} onChange={setQ} />
        <Checkbox checked={allOn} onChange={toggleAll} label={`اختيار الكل (${list.length})`} />
      </div>
      <div className="divide-y divide-line-soft">
        {list.slice(0, 400).map((v) => (
          <label key={v.p.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={sel.has(v.p.id)}
              onChange={() =>
                setSel((s) => {
                  const n = new Set(s)
                  if (n.has(v.p.id)) n.delete(v.p.id)
                  else n.add(v.p.id)
                  return n
                })
              }
            />
            <span className="min-w-0 flex-1 truncate font-bold">{v.p.name}</span>
            <span className="shrink-0 text-xs text-ink-3">
              {showCost && `${money(v.p.cost_price)} / `}
              <span className="text-green">{money(v.p.sell_price)}</span> / <span className="text-orange">{money(v.p.min_sell_price)}</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

// ───────── المكونات (الشاحن = راس + وصلة) ─────────

function PartsEditor({ pv, onClose }: { pv: ProductView; onClose: () => void }) {
  const parts = useShop((s) => s.parts.byParent.get(pv.p.id) ?? [])
  const byId = useShop((s) => s.byId)
  const [rows, setRows] = useState(() => parts.map((x) => ({ id: x.partId, qty: String(x.qty) })))
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(
      () => rpc('set_parts', { p_product: pv.p.id, p_parts: rows.map((r) => ({ part_id: r.id, qty: parseInt0(r.qty) ?? 0 })).filter((r) => r.qty > 0) }),
      'تم حفظ المكونات',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`مكونات ${pv.p.name}`}
      footer={
        <Button block loading={busy} onClick={save}>
          حفظ
        </Button>
      }
    >
      <div className="mb-3 text-sm text-ink-3">الشاحن الكامل بيتفك لأجزاءه (راس + وصلة). لما جزء يخلص، السيرفر بيفك شاحن لوحده وقت البيع.</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-bold">{byId.get(r.id)?.p.name ?? `منتج #${r.id}`}</span>
            <NumInput decimal={false} className="w-20" value={r.qty} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
            <IconButton label="حذف" className="text-red" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Trash2 className="h-5 w-5" />
            </IconButton>
          </div>
        ))}
        {!rows.length && <div className="py-4 text-center text-ink-3">مفيش مكونات. المنتج مش بيتفك.</div>}
        <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
          إضافة جزء
        </Button>
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        pickVariant={false}
        filter={(v) => v.p.id !== pv.p.id && !rows.some((r) => r.id === v.p.id)}
        onPick={(v) => setRows((x) => [...x, { id: v.p.id, qty: '1' }])}
      />
    </Modal>
  )
}

// ───────── العروض والباكدجات ─────────

function Offers({ onClose }: { onClose: () => void }) {
  const offers = useShop((s) => s.offers)
  const byId = useShop((s) => s.byId)
  const [edit, setEdit] = useState<Offer | 'new' | null>(null)
  const del = async (o: Offer) => {
    if (!(await confirmDialog({ title: 'حذف العرض', message: `هيتحذف عرض "${o.name}"`, ok: 'حذف', danger: true }))) return
    await run(() => rpc('delete_offer', { p_id: o.id }), 'تم حذف العرض')
  }
  return (
    <Modal open onClose={onClose} title="العروض والباكدجات" size="lg">
      <Button icon={<Plus className="h-5 w-5" />} className="mb-3" onClick={() => setEdit('new')}>
        عرض جديد
      </Button>
      {offers.length === 0 ? (
        <Empty icon={<Gift />} text="مفيش عروض لسه" />
      ) : (
        <div className="space-y-2">
          {offers.map((o) => {
            const ov = offerView(o, byId)
            return (
              <div key={o.id} className="rounded-card border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold">{o.name}</div>
                    <div className="text-sm text-ink-2">{ov.summary || 'المنتجات اتحذفت'}</div>
                  </div>
                  <Money v={o.price} className="shrink-0 text-lg font-extrabold text-green" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {ov.saving > EPS && <Tag color="green">توفير {money(ov.saving)}</Tag>}
                  <div className="flex-1" />
                  <Button size="sm" variant="soft" onClick={() => setEdit(o)}>
                    تعديل
                  </Button>
                  <Button size="sm" variant="danger-soft" onClick={() => del(o)}>
                    حذف
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {edit && <OfferEditor offer={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Modal>
  )
}

function OfferEditor({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const byId = useShop((s) => s.byId)
  const [name, setName] = useState(offer?.name ?? '')
  const [price, setPrice] = useState(offer ? String(offer.price) : '')
  const [items, setItems] = useState(() => (offer?.items ?? []).filter((i) => byId.has(i.product_id)).map((i) => ({ id: i.product_id, qty: String(i.qty) })))
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const normal = items.reduce((s, i) => s + (byId.get(i.id)?.p.sell_price ?? 0) * (parseInt0(i.qty) ?? 0), 0)
  const minTotal = items.reduce((s, i) => s + (byId.get(i.id)?.p.min_sell_price ?? 0) * (parseInt0(i.qty) ?? 0), 0)
  const pn = parseNum(price)
  const err = pn != null && pn + EPS < minTotal ? `سعر العرض مينفعش يقل عن ${money(minTotal)} (مجموع أقل الأسعار)` : null
  const save = async () => {
    setBusy(true)
    const ok = await run(
      () =>
        rpc('save_offer', {
          p_id: offer?.id ?? null,
          p_name: name.trim(),
          p_price: pn,
          p_items: items.map((i) => ({ product_id: i.id, qty: parseInt0(i.qty) ?? 0 })).filter((i) => i.qty > 0),
        }),
      'تم حفظ العرض',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={offer ? 'تعديل عرض' : 'عرض جديد'}
      footer={
        <Button block loading={busy} disabled={!name.trim() || !pn || !items.length || !!err} onClick={save}>
          حفظ العرض
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="اسم العرض">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: جراب + اسكرينة" />
        </Field>
        <div className="space-y-2">
          <div className="font-bold text-ink-2">المنتجات</div>
          {items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-bold">{byId.get(it.id)?.p.name}</span>
              <NumInput decimal={false} className="w-20" value={it.qty} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
              <IconButton label="حذف" className="text-red" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>
                <Trash2 className="h-5 w-5" />
              </IconButton>
            </div>
          ))}
          <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
            إضافة منتج
          </Button>
        </div>
        {items.length > 0 && (
          <div className="rounded-btn bg-bg px-3 py-2 text-sm">
            <KV k="السعر العادي" v={<Money v={normal} />} />
            <KV k="مجموع أقل الأسعار" v={<Money v={minTotal} />} color="orange" />
          </div>
        )}
        <Field label="سعر العرض" error={err}>
          <NumInput value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        pickVariant={false}
        filter={(v) => !items.some((i) => i.id === v.p.id)}
        onPick={(v) => setItems((x) => [...x, { id: v.p.id, qty: '1' }])}
      />
    </Modal>
  )
}

