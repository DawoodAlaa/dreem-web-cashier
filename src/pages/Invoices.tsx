import { ArrowRight, FileText, Plus, RotateCcw, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ProductPicker } from '@/components/ProductPicker'
import { Button, Checkbox, Chips, Empty, ErrorBox, Field, IconButton, KV, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, SearchBox, Stat, StatGrid, Tag, TextArea, cx, useIsMobile, type Color } from '@/components/ui'
import { LoadMore, VirtualList } from '@/components/virtual'
import { nums, q as one, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { EPS, dateTimeFmt, iso, makeRange, money, parseInt0, parseNum, roundMoney, variantLabel, type DateRange } from '@/lib/format'
import { setArg, useNav } from '@/lib/nav'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { Adjustment, Invoice, InvoiceItem, ProductView, Variant } from '@/lib/types'
import { safeSearch, useDebounced, usePaged } from '@/lib/usePaged'
import { useLive } from '@/lib/useLive'

type Status = 'all' | 'done' | 'return' | 'exchange' | 'voided'

function fixInvoice(inv: Invoice): Invoice {
  nums(inv, ['subtotal', 'discount', 'total', 'paid'])
  inv.invoice_items.forEach((it) => nums(it, ['cost_price', 'base_price', 'min_price', 'unit_price', 'qty']))
  inv.adjustments.sort((a, b) => a.id - b.id)
  inv.adjustments.forEach((a) => {
    nums(a, ['in_total', 'out_total', 'cash_delta', 'debt_delta'])
    a.adjustment_items.forEach((x) => nums(x, ['unit_price', 'cost_price', 'qty']))
  })
  return inv
}

export function invoiceStatus(inv: Invoice): { key: Status; label: string; color: Color } {
  if (inv.voided) return { key: 'voided', label: 'ملغاة', color: 'gray' }
  const adj = inv.adjustments.filter((a) => !a.voided)
  if (adj.some((a) => a.kind === 'exchange')) return { key: 'exchange', label: 'استبدال', color: 'purple' }
  if (adj.some((a) => a.kind === 'return')) {
    const sold = inv.invoice_items.reduce((s, i) => s + i.qty, 0)
    const back = adj.reduce((s, a) => s + a.adjustment_items.filter((x) => x.direction === 'in').reduce((t, x) => t + x.qty, 0), 0)
    return { key: 'return', label: back >= sold ? 'مرتجع كامل' : 'مرتجع جزئي', color: 'red' }
  }
  return { key: 'done', label: 'مكتملة', color: 'green' }
}

/** الصافي بعد المرتجعات والاستبدالات */
export function invoiceNet(inv: Invoice) {
  if (inv.voided) return 0
  return roundMoney(inv.adjustments.filter((a) => !a.voided).reduce((s, a) => s - a.in_total + a.out_total, inv.total))
}

const SELECT = '*, invoice_items(*), adjustments(*, adjustment_items(*))'

/** طلب الفواتير بالفلاتر (بيتنفذ على السيرفر صفحة صفحة) */
async function buildInvoicesQuery(range: DateRange, status: Status, search: string) {
  const extra = status === 'done' ? ', live:adjustments(id)' : status === 'return' || status === 'exchange' ? ', f:adjustments!inner(id)' : ''
  let qb = supabase
    .from('invoices')
    .select(SELECT + extra, { count: 'exact' })
    .gte('created_at', iso(range.from))
    .lt('created_at', iso(range.to))
  if (status === 'voided') qb = qb.eq('voided', true)
  else if (status === 'done') qb = qb.eq('voided', false).eq('live.voided', false).is('live', null)
  else if (status === 'return' || status === 'exchange') qb = qb.eq('voided', false).eq('f.kind', status).eq('f.voided', false)
  const s = safeSearch(search.replace('#', ''))
  if (/^\d+$/.test(s)) qb = qb.eq('no', Number(s))
  else if (s) {
    // الفواتير اللي فيها منتج بالاسم ده
    const items = (await one(supabase.from('invoice_items').select('invoice_id').ilike('product_name', `%${s}%`).limit(300))) as { invoice_id: number }[]
    const ids = [...new Set(items.map((x) => x.invoice_id))]
    qb = qb.or(`customer_name.ilike.*${s}*${ids.length ? `,id.in.(${ids.join(',')})` : ''}`)
  }
  return { q: qb.order('id', { ascending: false }) }
}

export default function InvoicesPage() {
  const mobile = useIsMobile()
  const arg = useNav((s) => s.arg)
  const [range, setRange] = useState<DateRange>(() => makeRange('today'))
  const [status, setStatus] = useState<Status>('all')
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const rk = `${iso(range.from)}:${iso(range.to)}`
  const paged = usePaged<Invoice>(`inv:${rk}:${status}:${search}`, ['invoices', 'adjustments'], () => buildInvoicesQuery(range, status, search), fixInvoice, 50)
  const summary = useLive(`invsum:${rk}`, ['invoices', 'adjustments'], async () => {
    const j = await rpc<{ count: number; voided: number; net: number }>('invoices_summary', { p_from: iso(range.from), p_to: iso(range.to) })
    return { count: Number(j.count), voided: Number(j.voided), net: Number(j.net) }
  })

  const list = paged.rows
  const filtered = status !== 'all' || !!search.trim()
  const sum = summary.data
  const selectedId = arg ? Number(arg) : null
  const selected = selectedId ? (list.find((i) => i.id === selectedId) ?? null) : null

  const open = (id: number | null) => setArg(id == null ? null : String(id))

  if (mobile && selectedId) {
    return <InvoiceDetailLoader id={selectedId} fromList={selected} onBack={() => history.back()} />
  }

  return (
    <div>
      <PageHeader title="الفواتير" />
      <div className="mb-3 space-y-2">
        <RangeFilter value={range} onChange={setRange} />
        <Chips<Status>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'done', label: 'مكتملة' },
            { value: 'return', label: 'مرتجع' },
            { value: 'exchange', label: 'استبدال' },
            { value: 'voided', label: 'ملغاة' },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="بحث برقم الفاتورة أو اسم العميل أو المنتج" />
      </div>
      <StatGrid cols={3}>
        <Stat label="عدد الفواتير" value={sum ? sum.count : '...'} color="primary" sub={sum?.voided ? `+ ${sum.voided} ملغاة` : undefined} />
        <Stat label="صافي المبيعات" value={sum ? <Money v={sum.net} /> : '...'} color="green" />
        <Stat label="متوسط الفاتورة" value={sum ? <Money v={sum.count ? sum.net / sum.count : 0} /> : '...'} />
      </StatGrid>
      {filtered && paged.total != null && <div className="mb-2 text-sm font-bold text-ink-3">{paged.total} فاتورة مطابقة</div>}

      <div className="lg:flex lg:items-start lg:gap-4">
        <div className="min-w-0 flex-1">
          {paged.error && !list.length ? (
            <ErrorBox text={paged.error} onRetry={paged.reload} />
          ) : paged.loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty icon={<FileText />} text={filtered ? 'مفيش فواتير مطابقة' : 'مفيش فواتير في الفترة دي'} />
          ) : (
            <>
              <VirtualList items={list} estimate={76} getKey={(i) => i.id} render={(inv) => <InvoiceRow inv={inv} active={inv.id === selectedId} onClick={() => open(inv.id)} />} />
              <LoadMore hasMore={paged.hasMore} loading={paged.loadingMore} onMore={paged.loadMore} shown={list.length} total={paged.total} />
            </>
          )}
        </div>
        {!mobile && (
          <div className="sticky top-[88px] w-[46%] max-w-[620px] shrink-0">
            {selectedId ? (
              <InvoiceDetailLoader id={selectedId} fromList={selected} onBack={() => open(null)} />
            ) : (
              <div className="card">
                <Empty icon={<FileText />} text="اختار فاتورة عشان تشوف تفاصيلها" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceRow({ inv, active, onClick }: { inv: Invoice; active: boolean; onClick: () => void }) {
  const st = invoiceStatus(inv)
  const count = inv.invoice_items.reduce((s, i) => s + i.qty, 0)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('card flex w-full items-center gap-3 p-3 text-right transition', active ? 'border-primary ring-2 ring-primary/15' : 'hover:border-primary/40', inv.voided && 'opacity-60')}
    >
      <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-btn bg-primary-light text-primary">
        <span className="num text-[15px] font-extrabold">#{inv.no}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-bold">{inv.customer_name || 'عميل نقدي'}</span>
          <Tag color={st.color}>{st.label}</Tag>
        </div>
        <div className="truncate text-xs text-ink-3">
          {dateTimeFmt(inv.created_at)} • {count} قطعة{inv.user_name ? ` • ${inv.user_name}` : ''}
        </div>
      </div>
      <Money v={invoiceNet(inv)} className={cx('shrink-0 font-extrabold', inv.voided ? 'text-ink-3 line-through' : 'text-ink')} />
    </button>
  )
}

/** بيجيب الفاتورة لو مش في القايمة (مثلاً فتحتها من رابط أو من صفحة العميل) */
function InvoiceDetailLoader({ id, fromList, onBack }: { id: number; fromList: Invoice | null; onBack: () => void }) {
  const live = useLive(fromList ? null : `invoice:${id}`, ['invoices', 'adjustments'], async () => {
    const rows = (await one(supabase.from('invoices').select(SELECT).eq('id', id))) as Invoice[]
    return rows[0] ? fixInvoice(rows[0]) : null
  })
  const inv = fromList ?? live.data
  if (!inv) {
    if (live.loading) return <Loading />
    return (
      <div className="card p-6">
        <Empty text={live.error ?? 'الفاتورة مش موجودة'} />
        <Button variant="soft" block onClick={onBack}>
          رجوع
        </Button>
      </div>
    )
  }
  return <InvoiceDetail inv={inv} onBack={onBack} />
}

export function InvoiceDetail({ inv, onBack }: { inv: Invoice; onBack?: () => void }) {
  const canReturn = useCan('returns')
  const canReports = useCan('reports')
  const [mode, setMode] = useState<'return' | 'exchange' | null>(null)
  const st = invoiceStatus(inv)
  const debt = roundMoney(inv.total - inv.paid)
  const returned = returnedQty(inv)
  const anyLeft = inv.invoice_items.some((it) => it.qty - (returned.get(it.id) ?? 0) > 0)
  const cost = inv.invoice_items.reduce((s, it) => s + it.cost_price * it.qty, 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5 lg:px-4">
        {onBack && (
          <IconButton label="رجوع" onClick={onBack}>
            <ArrowRight className="h-5 w-5" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-lg font-extrabold">
            فاتورة #{inv.no} <Tag color={st.color}>{st.label}</Tag>
          </div>
          <div className="text-xs text-ink-3">
            {dateTimeFmt(inv.created_at)}
            {inv.user_name ? ` • الكاشير: ${inv.user_name}` : ''}
          </div>
        </div>
      </div>
      <div className="p-3 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto lg:p-4">
        <KV k="العميل" v={inv.customer_name || 'عميل نقدي'} />
        <div className="mt-2 divide-y divide-line-soft rounded-btn border border-line-soft">
          {inv.invoice_items.map((it) => {
            const back = returned.get(it.id) ?? 0
            return (
              <div key={it.id} className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-bold">{variantLabel(it.product_name, it.variant_name)}</div>
                  <div className="text-xs text-ink-3">
                    {it.qty} × {money(it.unit_price)}
                    {Math.abs(it.unit_price - it.base_price) > EPS && <span className="mr-1 text-orange line-through">{money(it.base_price)}</span>}
                    {back > 0 && <span className="mr-2 font-bold text-red">رجع {back}</span>}
                  </div>
                </div>
                <Money v={it.unit_price * it.qty} className="shrink-0 font-bold" />
              </div>
            )
          })}
        </div>
        <div className="mt-3">
          <KV k="المجموع" v={<Money v={inv.subtotal} />} />
          {inv.discount > 0 && <KV k="الخصم" v={<Money v={inv.discount} />} color="orange" />}
          <KV k="الإجمالي" v={<Money v={inv.total} />} strong />
          <KV k="المدفوع" v={<Money v={inv.paid} />} />
          {debt > EPS && <KV k="آجل" v={<Money v={debt} />} color="orange" />}
          {canReports && !inv.voided && <KV k="مكسب البيع" v={<Money v={inv.total - cost} />} color="green" />}
          {inv.note && <div className="mt-2 rounded-btn bg-bg px-3 py-2 text-sm text-ink-2">{inv.note}</div>}
        </div>

        {inv.adjustments.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="font-extrabold">المرتجعات والاستبدالات</div>
            {inv.adjustments.map((a) => (
              <AdjustmentCard key={a.id} a={a} />
            ))}
          </div>
        )}

        {canReturn && !inv.voided && anyLeft && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="danger-soft" icon={<RotateCcw className="h-5 w-5" />} onClick={() => setMode('return')}>
              مرتجع
            </Button>
            <Button variant="soft" icon={<Repeat className="h-5 w-5" />} onClick={() => setMode('exchange')}>
              استبدال
            </Button>
          </div>
        )}
      </div>
      {mode && <AdjustModal inv={inv} mode={mode} onClose={() => setMode(null)} />}
    </div>
  )
}

function AdjustmentCard({ a }: { a: Adjustment }) {
  const ins = a.adjustment_items.filter((x) => x.direction === 'in')
  const outs = a.adjustment_items.filter((x) => x.direction === 'out')
  return (
    <div className={cx('rounded-btn border p-3 text-sm', a.voided ? 'border-line opacity-60' : a.kind === 'return' ? 'border-red/30 bg-red-light/40' : 'border-purple/30 bg-purple-light/40')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-extrabold">
          {a.kind === 'return' ? 'مرتجع' : 'استبدال'}
          {a.voided && <Tag color="gray">تم التراجع</Tag>}
        </span>
        <span className="text-xs text-ink-3">{dateTimeFmt(a.created_at)}</span>
      </div>
      {ins.map((x) => (
        <div key={x.id} className="mt-1 flex justify-between gap-2">
          <span className="text-ink-2">
            ↩ {variantLabel(x.product_name, x.variant_name)} × {x.qty}
            {x.damaged && <span className="mr-1 font-bold text-red">(تالف)</span>}
          </span>
          <Money v={x.unit_price * x.qty} />
        </div>
      ))}
      {outs.map((x) => (
        <div key={x.id} className="mt-1 flex justify-between gap-2">
          <span className="text-ink-2">
            ↪ {variantLabel(x.product_name, x.variant_name)} × {x.qty}
          </span>
          <Money v={x.unit_price * x.qty} />
        </div>
      ))}
      <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-bold">
        {a.cash_delta < -EPS && <Tag color="red">العميل استلم {money(-a.cash_delta)}</Tag>}
        {a.cash_delta > EPS && <Tag color="green">العميل دفع {money(a.cash_delta)}</Tag>}
        {a.debt_delta < -EPS && <Tag color="teal">اتخصم من المديونية {money(-a.debt_delta)}</Tag>}
      </div>
      {a.note && <div className="mt-1 text-xs text-ink-3">{a.note}</div>}
    </div>
  )
}

function returnedQty(inv: Invoice): Map<number, number> {
  const m = new Map<number, number>()
  for (const a of inv.adjustments) {
    if (a.voided) continue
    for (const x of a.adjustment_items) if (x.direction === 'in' && x.invoice_item_id) m.set(x.invoice_item_id, (m.get(x.invoice_item_id) ?? 0) + x.qty)
  }
  return m
}

// ───────── المرتجع والاستبدال ─────────

interface OutLine {
  pv: ProductView
  v: Variant
  qty: string
  price: string
}

function AdjustModal({ inv, mode, onClose }: { inv: Invoice; mode: 'return' | 'exchange'; onClose: () => void }) {
  const returned = returnedQty(inv)
  const factor = inv.subtotal <= 0 ? 1 : inv.total / inv.subtotal
  const [ins, setIns] = useState<Record<number, { qty: number; damaged: boolean }>>({})
  const [outs, setOuts] = useState<OutLine[]>([])
  const [picking, setPicking] = useState(false)
  const [offset, setOffset] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const balance = useLive(inv.customer_id ? `cbal:${inv.customer_id}` : null, ['customer_txns'], async () => {
    const rows = (await one(supabase.from('customers_view').select('balance').eq('id', inv.customer_id!))) as { balance: number }[]
    return Number(rows[0]?.balance ?? 0)
  })

  const left = (it: InvoiceItem) => it.qty - (returned.get(it.id) ?? 0)
  const inTotal = roundMoney(inv.invoice_items.reduce((s, it) => s + it.unit_price * factor * (ins[it.id]?.qty ?? 0), 0))
  const outTotal = roundMoney(outs.reduce((s, o) => s + (parseNum(o.price) ?? 0) * (parseInt0(o.qty) ?? 0), 0))
  const diff = roundMoney(outTotal - inTotal)
  const custBal = balance.data ?? 0
  const offsetAmt = diff < 0 && offset && inv.customer_id && custBal > EPS ? Math.min(-diff, custBal) : 0
  const cash = roundMoney(diff + offsetAmt)
  const anyIn = Object.values(ins).some((x) => x.qty > 0)

  let err: string | null = null
  if (!anyIn) err = 'اختار المنتجات اللي راجعة'
  else if (mode === 'exchange' && !outs.length) err = 'اختار المنتجات البديلة'
  for (const o of outs) {
    const pn = parseNum(o.price)
    if ((parseInt0(o.qty) ?? 0) <= 0) err = 'اكتب الكمية'
    else if (pn == null || pn + EPS < o.pv.p.min_sell_price) err = `سعر "${o.pv.p.name}" أقل من أقل سعر بيع (${money(o.pv.p.min_sell_price)})`
  }

  const setIn = (id: number, patch: Partial<{ qty: number; damaged: boolean }>) =>
    setIns((s) => ({ ...s, [id]: { qty: s[id]?.qty ?? 0, damaged: s[id]?.damaged ?? false, ...patch } }))

  const save = async () => {
    if (err) return
    setBusy(true)
    const ok = await run(
      () =>
        rpc('create_adjustment', {
          p: {
            invoice_id: inv.id,
            ins: inv.invoice_items.filter((it) => (ins[it.id]?.qty ?? 0) > 0).map((it) => ({ invoice_item_id: it.id, qty: ins[it.id].qty, damaged: ins[it.id].damaged })),
            outs: mode === 'exchange' ? outs.map((o) => ({ variant_id: o.v.id, qty: parseInt0(o.qty), unit_price: parseNum(o.price) })) : [],
            offset_debt: offsetAmt > 0,
            note: note.trim() || null,
          },
        }),
      mode === 'return' ? 'تم تسجيل المرتجع' : 'تم تسجيل الاستبدال',
    )
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${mode === 'return' ? 'مرتجع' : 'استبدال'} — فاتورة #${inv.no}`}
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-ink-2">
              {cash < -EPS ? 'العميل ياخد' : cash > EPS ? 'العميل يدفع' : 'الصافي'}
            </span>
            <Money v={Math.abs(cash)} className={cx('text-2xl font-extrabold', cash < -EPS ? 'text-red' : cash > EPS ? 'text-green' : 'text-ink')} />
          </div>
          <Button block loading={busy} disabled={!!err} onClick={save} variant={mode === 'return' ? 'danger' : 'primary'}>
            تأكيد {mode === 'return' ? 'المرتجع' : 'الاستبدال'}
          </Button>
          {err && anyIn && <div className="text-center text-xs font-bold text-red">{err}</div>}
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 font-extrabold">المنتجات اللي راجعة</div>
          <div className="space-y-2">
            {inv.invoice_items.map((it) => {
              const max = left(it)
              const cur = ins[it.id]?.qty ?? 0
              return (
                <div key={it.id} className={cx('rounded-btn border p-3', cur > 0 ? 'border-red/40 bg-red-light/30' : 'border-line', max <= 0 && 'opacity-50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold">{variantLabel(it.product_name, it.variant_name)}</div>
                      <div className="text-xs text-ink-3">
                        اتباع {it.qty} • يرجع لحد {max} • سعر القطعة {money(it.unit_price * factor)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center rounded-btn border border-line bg-white">
                      <button type="button" className="flex h-10 w-10 items-center justify-center" disabled={cur <= 0} onClick={() => setIn(it.id, { qty: cur - 1 })}>
                        −
                      </button>
                      <span className="num w-7 text-center font-extrabold">{cur}</span>
                      <button type="button" className="flex h-10 w-10 items-center justify-center" disabled={cur >= max} onClick={() => setIn(it.id, { qty: cur + 1 })}>
                        +
                      </button>
                    </div>
                  </div>
                  {cur > 0 && <Checkbox checked={ins[it.id]?.damaged ?? false} onChange={(v) => setIn(it.id, { damaged: v })} label="القطعة تالفة" sub="هتتسجل هالك ومش هترجع للمخزون" />}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-sm font-bold">
            <span className="text-ink-3">قيمة المرتجع</span>
            <Money v={inTotal} />
          </div>
        </div>

        {mode === 'exchange' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-extrabold">المنتجات البديلة</span>
              <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
                إضافة منتج
              </Button>
            </div>
            <div className="space-y-2">
              {outs.map((o, i) => (
                <div key={i} className="rounded-btn border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-bold">{variantLabel(o.pv.p.name, o.v.name)}</div>
                    <button type="button" className="icon-btn h-9 w-9 text-red" aria-label="حذف" onClick={() => setOuts((x) => x.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="الكمية">
                      <NumInput decimal={false} value={o.qty} onChange={(e) => setOuts((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
                    </Field>
                    <Field label={`السعر (أقل ${money(o.pv.p.min_sell_price)})`}>
                      <NumInput value={o.price} onChange={(e) => setOuts((x) => x.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            {outs.length > 0 && (
              <div className="mt-2 flex justify-between text-sm font-bold">
                <span className="text-ink-3">قيمة البديل</span>
                <Money v={outTotal} />
              </div>
            )}
          </div>
        )}

        {inv.customer_id && diff < -EPS && custBal > EPS && (
          <Checkbox
            checked={offset}
            onChange={setOffset}
            label={`اخصم من مديونية العميل (عليه ${money(custBal)} ج.م)`}
            sub="الفلوس المرتجعة تتخصم من الآجل بدل ما تتدفع من الدرج"
          />
        )}
        <Field label="ملاحظات">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        onlySellable
        onPick={(pv, v) => setOuts((x) => [...x, { pv, v, qty: '1', price: money(pv.p.sell_price).replace(/,/g, '') }])}
      />
    </Modal>
  )
}
