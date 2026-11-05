import { Check, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Field, IconButton, Input, NumInput, PageHeader, Segmented, Select, Tag, cx } from '@/components/ui'
import { rpc } from '@/lib/api'
import { useAuth, useCan } from '@/lib/auth'
import { dateTimeFmt, int, money, norm, parseInt0, parseNum } from '@/lib/format'
import { setArg, useNav } from '@/lib/nav'
import { useShop, useTrackStock, vPrice } from '@/lib/shop'
import { run, toast } from '@/lib/toast'
import type { ProductView } from '@/lib/types'

// ───────── الأنواع ─────────

interface ArchiveItem {
  id: number
  name: string
  category_id: number
  sell: number
  cost: number | null // null: الموظف مش بيشوف الجملة
  key: string
}

/** الصف مربوط بمنتج موجود (يتزود عدده) أو بمنتج في الأرشيف (يرجع) */
type Link = { kind: 'variant'; id: number; stock: number | null } | { kind: 'archive'; id: number }

interface Row {
  k: number
  name: string
  qty: string
  cost: string
  sell: string
  link: Link | null
}

interface Suggestion {
  key: string
  label: string
  category: number
  cost: number | null
  sell: number
  link: Link
}

type Col = 'name' | 'qty' | 'cost' | 'sell'

let seq = Date.now()
const blank = (cost = '', sell = ''): Row => ({ k: ++seq, name: '', qty: '', cost, sell, link: null })

// ───────── المسودة: الكتابة متضيعش لو الصفحة اتقفلت ─────────

const draftKey = (uid: string | undefined) => `cd.goods.${uid ?? ''}`

function loadDraft(uid: string | undefined): { cat: number; rows: Row[] } | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(uid)) ?? 'null')
    return d && Array.isArray(d.rows) && d.rows.length ? d : null
  } catch {
    return null
  }
}

function saveDraft(uid: string | undefined, cat: number, rows: Row[]) {
  try {
    if (rows.some((r) => r.name.trim())) localStorage.setItem(draftKey(uid), JSON.stringify({ cat, rows }))
    else localStorage.removeItem(draftKey(uid))
  } catch {
    // التخزين ممكن يبقى مقفول في المتصفح، والشاشة بتشتغل من غيره
  }
}

// ───────── الاقتراحات والتحقق ─────────

function suggest(text: string, views: ProductView[], archive: ArchiveItem[], showCost: boolean): Suggestion[] {
  const n = norm(text)
  if (n.length < 2) return []
  const words = n.split(/\s+/)
  const out: Suggestion[] = []
  for (const v of views) {
    if (out.length >= 6) break
    if (v.p.is_used || !words.every((w) => v.key.includes(w))) continue
    for (const x of v.vs) {
      const price = vPrice(v, x)
      out.push({
        key: `v${x.id}`,
        label: x.name ? `${v.p.name} (${x.name})` : v.p.name,
        category: v.p.category_id,
        cost: showCost ? price.cost : null,
        sell: price.sell,
        link: { kind: 'variant', id: x.id, stock: x.uncounted ? null : x.stock },
      })
    }
  }
  for (const a of archive) {
    if (out.length >= 8) break
    if (!words.every((w) => a.key.includes(w))) continue
    out.push({ key: `a${a.id}`, label: a.name, category: a.category_id, cost: a.cost, sell: a.sell, link: { kind: 'archive', id: a.id } })
  }
  return out.slice(0, 8)
}

function rowErrors(r: Row, track: boolean) {
  const needPrice = r.link?.kind !== 'variant'
  return {
    qty: track && !((parseInt0(r.qty) ?? 0) > 0),
    cost: needPrice && !r.link && (parseNum(r.cost) ?? -1) < 0,
    sell: needPrice && !((parseNum(r.sell) ?? 0) > 0),
  }
}

const hasError = (e: ReturnType<typeof rowErrors>) => e.qty || e.cost || e.sell

function rowHint(r: Row, track: boolean): { text: string; warn?: boolean } | null {
  const qty = parseInt0(r.qty) ?? 0
  if (r.link?.kind === 'variant') {
    if (!track) return { text: 'المنتج ده موجود بالفعل' }
    if (r.link.stock == null) return { text: 'لسه متعدّش: العدد اللي هتكتبه هيبقى رصيده' }
    return { text: qty > 0 ? `عندك ${int(r.link.stock)} وهيبقوا ${int(r.link.stock + qty)}` : `عندك ${int(r.link.stock)}. اكتب العدد اللي وصل` }
  }
  const cost = parseNum(r.cost)
  const sell = parseNum(r.sell)
  if (cost != null && sell != null && cost > sell) return { text: 'الجملة أكبر من سعر البيع. راجع الأرقام', warn: true }
  if (r.link?.kind === 'archive') return { text: 'كان في الأرشيف. راجع السعر قبل الحفظ' }
  return null
}

// ───────── صف المنتج ─────────

const GRID_COUNT = 'grid grid-cols-[repeat(3,minmax(0,1fr))_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_72px_84px_84px_40px]'
const GRID_PRICE = 'grid grid-cols-[repeat(2,minmax(0,1fr))_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_84px_84px_40px]'

function CellLabel({ text }: { text: string }) {
  return <span className="mb-0.5 block text-[11px] font-bold text-ink-3 sm:hidden">{text}</span>
}

function GoodsRow({
  r,
  track,
  showCost,
  tried,
  suggestions,
  categoryName,
  onChange,
  onEnter,
  onFocusName,
  onLeaveName,
  onPick,
  onRemove,
}: {
  r: Row
  track: boolean
  showCost: boolean
  tried: boolean
  suggestions: Suggestion[]
  categoryName: (id: number) => string
  onChange: (patch: Partial<Row>) => void
  onEnter: (col: Col) => void
  onFocusName: () => void
  onLeaveName: () => void
  onPick: (s: Suggestion) => void
  onRemove: () => void
}) {
  const named = !!r.name.trim()
  const err = tried && named ? rowErrors(r, track) : { qty: false, cost: false, sell: false }
  const hint = rowHint(r, track)
  const fixedPrice = r.link?.kind === 'variant'
  const hiddenCost = !!r.link && !showCost
  const bad = 'border-red ring-1 ring-red'
  const enter = (col: Col) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter(col)
    }
  }
  return (
    <div className="rounded-card border border-line bg-white p-2.5">
      <div className={track ? GRID_COUNT : GRID_PRICE}>
        <div className={cx('min-w-0', track ? 'col-span-3 sm:col-span-1' : 'col-span-2 sm:col-span-1')}>
          <CellLabel text="اسم المنتج" />
          <Input
            data-cell={`${r.k}-name`}
            value={r.name}
            readOnly={!!r.link}
            placeholder="اكتب الاسم"
            autoComplete="off"
            enterKeyHint="next"
            className={cx(r.link && 'bg-bg')}
            onChange={(e) => {
              onChange({ name: e.target.value })
              onFocusName()
            }}
            onFocus={onFocusName}
            onKeyDown={enter('name')}
          />
        </div>
        <div className="flex items-end sm:order-last">
          <IconButton label="شيل الصف" className="text-red" onClick={onRemove}>
            <Trash2 className="h-5 w-5" />
          </IconButton>
        </div>
        {track && (
          <div onFocus={onLeaveName}>
            <CellLabel text="العدد" />
            <NumInput
              data-cell={`${r.k}-qty`}
              decimal={false}
              value={r.qty}
              enterKeyHint="next"
              className={cx(err.qty && bad)}
              onChange={(e) => onChange({ qty: e.target.value })}
              onKeyDown={enter('qty')}
            />
          </div>
        )}
        <div onFocus={onLeaveName}>
          <CellLabel text="الجملة" />
          <NumInput
            data-cell={`${r.k}-cost`}
            value={hiddenCost ? '' : r.cost}
            disabled={fixedPrice || hiddenCost}
            placeholder={hiddenCost ? 'محفوظ' : undefined}
            enterKeyHint="next"
            className={cx(err.cost && bad, (fixedPrice || hiddenCost) && 'bg-bg')}
            onChange={(e) => onChange({ cost: e.target.value })}
            onKeyDown={enter('cost')}
          />
        </div>
        <div onFocus={onLeaveName}>
          <CellLabel text="البيع" />
          <NumInput
            data-cell={`${r.k}-sell`}
            value={r.sell}
            disabled={fixedPrice}
            enterKeyHint="next"
            className={cx(err.sell && bad, fixedPrice && 'bg-bg')}
            onChange={(e) => onChange({ sell: e.target.value })}
            onKeyDown={enter('sell')}
          />
        </div>
      </div>
      {hint && <div className={cx('mt-1.5 text-xs font-bold', hint.warn ? 'text-orange' : 'text-ink-3')}>{hint.text}</div>}
      {suggestions.length > 0 && (
        <div className="mt-2 divide-y divide-line-soft overflow-hidden rounded-btn border border-line">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-right hover:bg-bg active:bg-bg"
              onClick={() => onPick(s)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{s.label}</span>
                <span className="block truncate text-xs text-ink-3">
                  {categoryName(s.category)} • بيع {money(s.sell)}
                </span>
              </span>
              <Tag color={s.link.kind === 'variant' ? 'primary' : 'orange'}>{s.link.kind === 'variant' ? 'موجود' : 'أرشيف'}</Tag>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────── الإضافة ─────────

function AddGoods() {
  const uid = useAuth((s) => s.profile?.id)
  const categories = useShop((s) => s.categories)
  const views = useShop((s) => s.views)
  const track = useTrackStock()
  const showCost = useCan('reports')
  const [draft] = useState(() => loadDraft(uid))
  const [cat, setCat] = useState(() => categories.find((c) => c.id === draft?.cat)?.id ?? categories[0]?.id ?? 0)
  const [rows, setRows] = useState<Row[]>(() => draft?.rows ?? [blank()])
  const [active, setActive] = useState<number | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [archive, setArchive] = useState<ArchiveItem[]>([])
  const [archiveAt, setArchiveAt] = useState(0)
  const focusNext = useRef<string | null>(null)

  useEffect(() => {
    let off = false
    rpc<Omit<ArchiveItem, 'key'>[]>('goods_archive')
      .then((list) => {
        if (off) return
        setArchive(list.map((a) => ({ ...a, sell: Number(a.sell), cost: a.cost == null ? null : Number(a.cost), key: norm(a.name) })))
      })
      .catch(() => {}) // الشاشة بتشتغل من غير اقتراحات الأرشيف
    return () => {
      off = true
    }
  }, [archiveAt])

  useEffect(() => saveDraft(uid, cat, rows), [uid, cat, rows])

  useEffect(() => {
    if (!focusNext.current) return
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${focusNext.current}"]`)
    focusNext.current = null
    el?.focus()
    el?.scrollIntoView({ block: 'center' })
  }, [rows])

  const activeRow = rows.find((r) => r.k === active)
  const suggestions = useMemo(
    () => (activeRow && !activeRow.link ? suggest(activeRow.name, views, archive, showCost) : []),
    [activeRow, views, archive, showCost],
  )
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? ''

  const list = rows.filter((r) => r.name.trim() && (track || r.link?.kind !== 'variant'))
  const pieces = list.reduce((s, r) => s + Math.max(parseInt0(r.qty) ?? 0, 0), 0)

  const patch = (k: number, p: Partial<Row>) => setRows((x) => x.map((r) => (r.k === k ? { ...r, ...p } : r)))

  const addRow = () => {
    // الأسعار بتتنسخ من آخر منتج جديد، فالبضاعة اللي بنفس السعر محتاجة الاسم والعدد بس
    const last = [...rows].reverse().find((r) => !r.link && r.name.trim())
    const next = blank(last?.cost, last?.sell)
    focusNext.current = `${next.k}-name`
    setActive(next.k)
    setRows((x) => [...x, next])
  }

  const remove = (k: number) => {
    setActive(null)
    setRows((x) => (x.length > 1 ? x.filter((r) => r.k !== k) : [blank()]))
  }

  const pick = (r: Row, s: Suggestion) => {
    setActive(null)
    focusNext.current = `${r.k}-${track ? 'qty' : s.link.kind === 'variant' ? 'name' : 'sell'}`
    patch(r.k, { name: s.label, link: s.link, cost: s.cost == null ? '' : String(s.cost), sell: String(s.sell) })
  }

  const onEnter = (r: Row, i: number, col: Col) => {
    if (col === 'name') {
      if (!r.name.trim()) return
      const same = suggestions.find((s) => norm(s.label) === norm(r.name) && s.category === cat)
      if (same && !r.link) return pick(r, same)
      setActive(null)
    }
    const order: Col[] = ['name', 'qty', 'cost', 'sell']
    for (const c of order.slice(order.indexOf(col) + 1)) {
      const el = document.querySelector<HTMLInputElement>(`[data-cell="${r.k}-${c}"]`)
      if (el && !el.disabled) return el.focus()
    }
    const next = rows[i + 1]
    if (next) document.querySelector<HTMLInputElement>(`[data-cell="${next.k}-name"]`)?.focus()
    else addRow()
  }

  const save = async () => {
    setTried(true)
    setActive(null)
    if (!list.length) return toast('اكتب منتج واحد على الأقل', 'error')
    if (list.some((r) => hasError(rowErrors(r, track)))) return toast('كمّل الخانات اللي باللون الأحمر', 'error')
    setBusy(true)
    let res: { new: number; back: number; added: number } | null = null
    const ok = await run(async () => {
      res = await rpc('add_goods', {
        p: {
          category_id: cat,
          rows: list.map((r) => {
            const qty = parseInt0(r.qty)
            if (r.link?.kind === 'variant') return { variant_id: r.link.id, qty }
            if (r.link?.kind === 'archive') return { restore_id: r.link.id, qty, sell: parseNum(r.sell), cost: showCost ? parseNum(r.cost) : undefined }
            return { name: r.name.trim(), qty, cost: parseNum(r.cost), sell: parseNum(r.sell) }
          }),
        },
      })
    })
    setBusy(false)
    if (!ok || !res) return
    const { new: fresh, back, added } = res as { new: number; back: number; added: number }
    const parts = [fresh > 0 && `${fresh} جديد`, back > 0 && `${back} من الأرشيف`, added > 0 && `${added} زاد عددهم`].filter(Boolean)
    toast(`اتحفظ: ${parts.join('، ')}`)
    setTried(false)
    setRows([blank()])
    setArchiveAt(Date.now())
  }

  return (
    <div className="space-y-3">
      <Field label="الصنف">
        <Select value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className={cx('hidden px-2.5 text-xs font-bold text-ink-3 sm:grid', track ? GRID_COUNT : GRID_PRICE)}>
        <span>اسم المنتج</span>
        {track && <span>العدد</span>}
        <span>الجملة</span>
        <span>البيع</span>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <GoodsRow
            key={r.k}
            r={r}
            track={track}
            showCost={showCost}
            tried={tried}
            suggestions={r.k === active ? suggestions : []}
            categoryName={categoryName}
            onChange={(p) => patch(r.k, p)}
            onEnter={(col) => onEnter(r, i, col)}
            onFocusName={() => setActive(r.k)}
            onLeaveName={() => setActive(null)}
            onPick={(s) => pick(r, s)}
            onRemove={() => remove(r.k)}
          />
        ))}
      </div>

      <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addRow}>
        منتج تاني
      </Button>

      <Button block loading={busy} onClick={save}>
        {list.length ? `حفظ ${int(list.length)} منتج${track ? ` (${int(pieces)} قطعة)` : ''}` : 'حفظ البضاعة'}
      </Button>
    </div>
  )
}

// ───────── المراجعة ─────────

type Prices = { cost: string; sell: string; min: string }

function ReviewRow({
  v,
  showCost,
  track,
  value,
  busy,
  onChange,
  onOk,
}: {
  v: ProductView
  showCost: boolean
  track: boolean
  value: Prices
  busy: boolean
  onChange: (p: Partial<Prices>) => void
  onOk: () => void
}) {
  return (
    <div className="rounded-card border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">{v.p.name}</div>
          <div className="mt-0.5 text-xs text-ink-3">
            إضافة {v.p.review_by} • {dateTimeFmt(v.p.review_at)}
          </div>
        </div>
        {track && <Tag color={v.allUncounted ? 'gray' : 'primary'}>{v.allUncounted ? 'لسه متعدّش' : `العدد ${int(v.stock)}`}</Tag>}
      </div>
      <div className={cx('mt-2 grid gap-2', showCost ? 'grid-cols-3' : 'grid-cols-2')}>
        {showCost && (
          <Field label="الجملة">
            <NumInput value={value.cost} onChange={(e) => onChange({ cost: e.target.value })} />
          </Field>
        )}
        <Field label="البيع">
          <NumInput value={value.sell} onChange={(e) => onChange({ sell: e.target.value })} />
        </Field>
        <Field label="أقل سعر">
          <NumInput value={value.min} onChange={(e) => onChange({ min: e.target.value })} />
        </Field>
      </div>
      <Button block size="sm" variant="soft" className="mt-2" disabled={busy} icon={<Check className="h-4 w-4" />} onClick={onOk}>
        تمام
      </Button>
    </div>
  )
}

function Review({ list }: { list: ProductView[] }) {
  const showCost = useCan('reports')
  const track = useTrackStock()
  const [edits, setEdits] = useState<Record<number, Partial<Prices>>>({})
  const [done, setDone] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const shown = list.filter((v) => !done.includes(v.p.id))

  const priceOf = (v: ProductView): Prices => ({
    cost: String(v.p.cost_price),
    sell: String(v.p.sell_price),
    min: String(v.p.min_sell_price),
    ...edits[v.p.id],
  })

  const confirm = async (items: ProductView[]) => {
    setBusy(true)
    const ok = await run(() =>
      rpc('goods_review', {
        p_items: items.map((v) => {
          const x = priceOf(v)
          return { id: v.p.id, cost: showCost ? parseNum(x.cost) : undefined, sell: parseNum(x.sell), min_sell: parseNum(x.min) }
        }),
      }),
    )
    setBusy(false)
    if (ok) setDone((d) => [...d, ...items.map((v) => v.p.id)])
  }

  if (!shown.length) return <Empty icon={<PackageCheck className="h-10 w-10" />} text="مفيش بضاعة مستنية مراجعة" />
  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-3">المنتجات دي بتتباع عادي. عدّل السعر لو محتاج، ودوس تمام.</div>
      {shown.map((v) => (
        <ReviewRow
          key={v.p.id}
          v={v}
          showCost={showCost}
          track={track}
          value={priceOf(v)}
          busy={busy}
          onChange={(p) => setEdits((e) => ({ ...e, [v.p.id]: { ...e[v.p.id], ...p } }))}
          onOk={() => void confirm([v])}
        />
      ))}
      {shown.length > 1 && (
        <Button block loading={busy} onClick={() => void confirm(shown)}>
          تمام للكل ({int(shown.length)})
        </Button>
      )}
    </div>
  )
}

// ───────── الصفحة ─────────

export default function GoodsPage() {
  const arg = useNav((s) => s.arg)
  const canReview = useCan('products')
  const views = useShop((s) => s.views)
  const waiting = useMemo(
    () => (canReview ? views.filter((v) => v.p.review_by).sort((a, b) => String(a.p.review_at).localeCompare(String(b.p.review_at))) : []),
    [views, canReview],
  )
  const tab = canReview && arg === 'review' ? 'review' : 'add'
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="إضافة بضاعة" />
      {canReview && (
        <div className="mb-4">
          <Segmented
            value={tab}
            onChange={(t) => setArg(t === 'review' ? 'review' : null, true)}
            options={[
              { value: 'add', label: 'إضافة' },
              { value: 'review', label: waiting.length ? `مراجعة (${int(waiting.length)})` : 'مراجعة' },
            ]}
          />
        </div>
      )}
      {tab === 'add' ? <AddGoods /> : <Review list={waiting} />}
    </div>
  )
}
