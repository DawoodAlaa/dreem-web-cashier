import { Banknote, Pencil, Plus, Trash2, Truck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PayModal } from '@/components/PayModal'
import { ProductPicker } from '@/components/ProductPicker'
import { Button, Empty, ErrorBox, Field, IconButton, Input, KV, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, SearchBox, Segmented, Select, Stat, StatGrid, Tag, TextArea, cx, useIsMobile } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { fetchAll, nums, q as one, rpc } from '@/lib/api'
import { EPS, dateTimeFmt, iso, makeRange, money, norm, parseInt0, parseNum, roundMoney, variantLabel, type DateRange } from '@/lib/format'
import { vPrice } from '@/lib/shop'
import { supabase } from '@/lib/supabase'
import { run, toast } from '@/lib/toast'
import type { ProductView, Purchase, Supplier, SupplierTxn, Variant } from '@/lib/types'
import { useLive } from '@/lib/useLive'

function useSuppliers() {
  return useLive('suppliers', ['suppliers', 'supplier_txns'], async () => {
    const rows = await fetchAll<Supplier>(() => supabase.from('suppliers_view').select().order('balance', { ascending: false }).order('name'))
    return rows.map((r) => nums(r, ['balance', 'total_purchases']))
  })
}

export default function PurchasesPage() {
  const mobile = useIsMobile()
  const [range, setRange] = useState<DateRange>(() => makeRange('month'))
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('purchases')
  const [creating, setCreating] = useState(false)
  const [openPurchase, setOpenPurchase] = useState<Purchase | null>(null)
  const [openSupplier, setOpenSupplier] = useState<Supplier | null>(null)
  const [editSupplier, setEditSupplier] = useState<Supplier | 'new' | null>(null)
  const suppliers = useSuppliers()
  const key = `${iso(range.from)}:${iso(range.to)}`
  const purchases = useLive(`pur:${key}`, ['purchases'], async () => {
    const rows = await fetchAll<Purchase>(() =>
      supabase.from('purchases').select('*, purchase_items(*)').gte('created_at', iso(range.from)).lt('created_at', iso(range.to)).order('id', { ascending: false }),
    )
    return rows.map((p) => {
      nums(p, ['total', 'paid'])
      p.purchase_items.forEach((i) => nums(i, ['qty', 'unit_cost', 'old_cost']))
      return p
    })
  })
  const payments = useLive(`suppay:${key}`, ['supplier_txns'], async () => {
    const rows = await fetchAll<SupplierTxn>(() =>
      supabase.from('supplier_txns').select('amount, kind, purchase_id, voided').eq('kind', 'payment').eq('voided', false).gte('created_at', iso(range.from)).lt('created_at', iso(range.to)),
    )
    return rows.reduce((s, r) => s - Number(r.amount), 0)
  })

  const active = (purchases.data ?? []).filter((p) => !p.voided)
  const total = active.reduce((s, p) => s + p.total, 0)
  const cashNoSupplier = active.filter((p) => !p.supplier_id).reduce((s, p) => s + p.paid, 0)
  const owed = (suppliers.data ?? []).reduce((s, x) => s + Math.max(0, x.balance), 0)

  const purchaseList = (
    <div className="min-w-0 flex-1">
      {purchases.error && !purchases.data ? (
        <ErrorBox text={purchases.error} onRetry={purchases.reload} />
      ) : purchases.loading ? (
        <Loading />
      ) : !purchases.data?.length ? (
        <Empty icon={<Truck />} text="مفيش فواتير شراء في الفترة دي" />
      ) : (
        <VirtualList
          items={purchases.data}
          estimate={72}
          getKey={(p) => p.id}
          render={(p) => (
            <button type="button" onClick={() => setOpenPurchase(p)} className={cx('card flex w-full items-center gap-3 p-3 text-right hover:border-primary/40', p.voided && 'opacity-60')}>
              <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-btn bg-purple-light font-extrabold text-purple">
                <span className="num">#{p.no}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{p.supplier_name || 'من غير تاجر'}</span>
                  {p.voided && <Tag>تم التراجع</Tag>}
                  {!p.voided && p.total - p.paid > EPS && <Tag color="orange">باقي {money(p.total - p.paid)}</Tag>}
                </div>
                <div className="truncate text-xs text-ink-3">
                  {dateTimeFmt(p.created_at)} • {p.purchase_items.reduce((s, i) => s + i.qty, 0)} قطعة
                </div>
              </div>
              <Money v={p.total} className="shrink-0 font-extrabold" />
            </button>
          )}
        />
      )}
    </div>
  )

  const supplierList = (
    <SupplierList suppliers={suppliers.data ?? []} loading={suppliers.loading} onOpen={setOpenSupplier} onNew={() => setEditSupplier('new')} />
  )

  return (
    <div>
      <PageHeader
        title="المشتريات"
        sub="حساب المشتريات منفصل عن فلوس الدرج"
        actions={
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setCreating(true)}>
            فاتورة شراء جديدة
          </Button>
        }
      />
      <div className="mb-3">
        <RangeFilter value={range} onChange={setRange} />
      </div>
      <StatGrid cols={3}>
        <Stat label="مشتريات الفترة" value={<Money v={total} />} color="purple" sub={`${active.length} فاتورة`} />
        <Stat label="عليك للتجار" value={<Money v={owed} />} color="orange" />
        <Stat label="المدفوع في الفترة" value={<Money v={(payments.data ?? 0) + cashNoSupplier} />} color="green" />
      </StatGrid>

      {mobile ? (
        <>
          <div className="mb-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'purchases', label: 'فواتير الشراء' },
                { value: 'suppliers', label: `التجار (${suppliers.data?.length ?? 0})` },
              ]}
            />
          </div>
          {tab === 'purchases' ? purchaseList : supplierList}
        </>
      ) : (
        <div className="flex items-start gap-4">
          {purchaseList}
          <div className="w-[380px] shrink-0">{supplierList}</div>
        </div>
      )}

      {creating && <NewPurchase suppliers={suppliers.data ?? []} onClose={() => setCreating(false)} />}
      {openPurchase && <PurchaseDetail p={openPurchase} onClose={() => setOpenPurchase(null)} />}
      {openSupplier && (
        <SupplierDetail
          s={(suppliers.data ?? []).find((x) => x.id === openSupplier.id) ?? openSupplier}
          onClose={() => setOpenSupplier(null)}
          onEdit={(s) => setEditSupplier(s)}
        />
      )}
      {editSupplier && <SupplierForm supplier={editSupplier === 'new' ? null : editSupplier} onClose={() => setEditSupplier(null)} />}
    </div>
  )
}

function SupplierList({ suppliers, loading, onOpen, onNew }: { suppliers: Supplier[]; loading: boolean; onOpen: (s: Supplier) => void; onNew: () => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const n = norm(q)
    return n ? suppliers.filter((s) => norm(s.name).includes(n) || (s.phone ?? '').includes(q)) : suppliers
  }, [suppliers, q])
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-extrabold">
          <Users className="h-5 w-5 text-primary" /> التجار
        </span>
        <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
          تاجر جديد
        </Button>
      </div>
      <SearchBox value={q} onChange={setQ} className="mb-2" />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="مفيش تجار" />
      ) : (
        <div className="divide-y divide-line-soft">
          {list.map((s) => (
            <button key={s.id} type="button" onClick={() => onOpen(s)} className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-right hover:bg-bg/50">
              <span className="min-w-0">
                <span className="block truncate font-bold">{s.name}</span>
                <span className="block text-xs text-ink-3">مشتريات {money(s.total_purchases)}</span>
              </span>
              {s.balance > EPS ? (
                <span className="shrink-0 text-sm font-bold text-orange">
                  عليك <Money v={s.balance} />
                </span>
              ) : (
                <Tag color="green">خالص</Tag>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Line {
  pv: ProductView
  v: Variant
  qty: string
  cost: string
}

function NewPurchase({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [lines, setLines] = useState<Line[]>([])
  const [picking, setPicking] = useState(false)
  const [paid, setPaid] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const total = roundMoney(lines.reduce((s, l) => s + (parseInt0(l.qty) ?? 0) * (parseNum(l.cost) ?? 0), 0))
  const paidN = paid == null ? total : (parseNum(paid) ?? 0)
  const rest = roundMoney(total - paidN)
  let err: string | null = null
  if (!lines.length) err = 'ضيف منتج واحد على الأقل'
  else if (lines.some((l) => (parseInt0(l.qty) ?? 0) <= 0)) err = 'اكتب الكمية'
  else if (lines.some((l) => (parseNum(l.cost) ?? 0) <= 0)) err = 'اكتب سعر الشراء'
  else if (rest > EPS && !supplierId) err = 'اختار التاجر عشان الباقي يتسجل عليك ليه'

  const save = async () => {
    if (err) return
    setBusy(true)
    let no = 0
    const ok = await run(async () => {
      const r = await rpc<{ id: number; no: number }>('create_purchase', {
        p: {
          supplier_id: supplierId || null,
          lines: lines.map((l) => ({ variant_id: l.v.id, qty: parseInt0(l.qty), unit_cost: parseNum(l.cost) })),
          paid: Math.min(paidN, total),
          note: note.trim() || null,
        },
      })
      no = r.no
    })
    setBusy(false)
    if (ok) {
      toast(`تم حفظ فاتورة الشراء #${no}`)
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="فاتورة شراء جديدة"
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-ink-2">الإجمالي</span>
            <Money v={total} className="text-2xl font-extrabold text-purple" />
          </div>
          <Button block loading={busy} disabled={!!err} onClick={save}>
            حفظ الفاتورة
          </Button>
          {err && lines.length > 0 && <div className="text-center text-xs font-bold text-red">{err}</div>}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <Field label="التاجر" className="flex-1">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">من غير تاجر (مدفوعة كاش)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="soft" onClick={() => setAdding(true)} icon={<Plus className="h-5 w-5" />}>
            تاجر
          </Button>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-extrabold">المنتجات</span>
            <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
              إضافة منتج
            </Button>
          </div>
          {lines.length === 0 && <div className="rounded-btn border border-dashed border-line py-6 text-center text-sm text-ink-3">ضيف المنتجات اللي اشتريتها</div>}
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-btn border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{variantLabel(l.pv.p.name, l.v.name)}</div>
                    <div className="text-xs text-ink-3">
                      الموجود {l.v.uncounted ? '؟' : l.v.stock} • سعر الجملة الحالي {money(vPrice(l.pv, l.v).cost)}
                    </div>
                  </div>
                  <IconButton label="حذف" className="h-9 w-9 text-red" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Field label="الكمية">
                    <NumInput decimal={false} value={l.qty} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} />
                  </Field>
                  <Field label="سعر القطعة">
                    <NumInput value={l.cost} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, cost: e.target.value } : y)))} />
                  </Field>
                  <div className="flex flex-col justify-end pb-2 text-left">
                    <Money v={(parseInt0(l.qty) ?? 0) * (parseNum(l.cost) ?? 0)} className="font-extrabold" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المدفوع للتاجر" hint="مش بيتخصم من الدرج">
            <NumInput value={paid ?? String(total)} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          <div className="flex flex-col justify-center rounded-btn bg-bg px-3">
            <span className="text-xs text-ink-3">الباقي عليك</span>
            <Money v={Math.max(0, rest)} className={cx('text-lg font-extrabold', rest > EPS ? 'text-orange' : 'text-ink-3')} />
          </div>
        </div>
        <Field label="ملاحظات">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        showCost
        onPick={(pv, v) => setLines((x) => [...x, { pv, v, qty: '1', cost: money(vPrice(pv, v).cost).replace(/,/g, '') }])}
      />
      {adding && <SupplierForm supplier={null} onClose={() => setAdding(false)} onSaved={(id) => setSupplierId(id)} />}
    </Modal>
  )
}

function PurchaseDetail({ p, onClose }: { p: Purchase; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`فاتورة شراء #${p.no}`}>
      <div className="mb-2 text-xs text-ink-3">{dateTimeFmt(p.created_at)}</div>
      {p.voided && <Tag className="mb-2">تم التراجع عنها</Tag>}
      <KV k="التاجر" v={p.supplier_name || 'من غير تاجر'} />
      <div className="my-2 divide-y divide-line-soft rounded-btn border border-line-soft">
        {p.purchase_items.map((i) => (
          <div key={i.id} className="flex items-start justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="font-bold">{variantLabel(i.product_name, i.variant_name)}</div>
              <div className="text-xs text-ink-3">
                {i.qty} × {money(i.unit_cost)}
                {Math.abs(i.unit_cost - i.old_cost) > EPS && <span className="mr-1">(كان {money(i.old_cost)})</span>}
              </div>
            </div>
            <Money v={i.qty * i.unit_cost} className="font-bold" />
          </div>
        ))}
      </div>
      <KV k="الإجمالي" v={<Money v={p.total} />} strong />
      <KV k="المدفوع" v={<Money v={p.paid} />} />
      {p.total - p.paid > EPS && <KV k="الباقي عليك" v={<Money v={p.total - p.paid} />} color="orange" />}
      {p.note && <div className="mt-2 rounded-btn bg-bg px-3 py-2 text-sm">{p.note}</div>}
    </Modal>
  )
}

const TXN_LABELS: Record<string, { label: string; color: 'purple' | 'green' | 'orange' }> = {
  purchase: { label: 'شراء', color: 'purple' },
  payment: { label: 'دفعة', color: 'green' },
  opening: { label: 'رصيد سابق', color: 'orange' },
}

function SupplierDetail({ s, onClose, onEdit }: { s: Supplier; onClose: () => void; onEdit: (s: Supplier) => void }) {
  const txns = useLive(`stx:${s.id}`, ['supplier_txns'], async () => {
    const rows = (await one(supabase.from('supplier_txns').select().eq('supplier_id', s.id).order('id', { ascending: false }))) as SupplierTxn[]
    return rows.map((r) => nums(r, ['amount']))
  })
  const [paying, setPaying] = useState(false)
  return (
    <Modal open onClose={onClose} title={s.name}>
      <div className="mb-3 rounded-card bg-orange-light p-4 text-center">
        <div className="text-sm font-bold text-orange">عليك للتاجر</div>
        <Money v={Math.max(0, s.balance)} className="text-3xl font-extrabold text-orange" />
      </div>
      {s.phone && <KV k="التليفون" v={<a href={`tel:${s.phone}`} dir="ltr" className="text-primary">{s.phone}</a>} />}
      {s.notes && <KV k="ملاحظات" v={s.notes} />}
      <div className="my-3 grid grid-cols-2 gap-2">
        <Button icon={<Banknote className="h-5 w-5" />} disabled={s.balance <= EPS} onClick={() => setPaying(true)}>
          دفعة للتاجر
        </Button>
        <Button variant="outline" icon={<Pencil className="h-5 w-5" />} onClick={() => onEdit(s)}>
          تعديل
        </Button>
      </div>
      <div className="mb-2 font-extrabold">الحركات</div>
      {txns.loading ? (
        <Loading />
      ) : !txns.data?.length ? (
        <Empty text="مفيش حركات" />
      ) : (
        <div className="divide-y divide-line-soft">
          {txns.data.map((t) => (
            <div key={t.id} className={cx('flex items-center justify-between gap-2 py-2', t.voided && 'opacity-50')}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Tag color={TXN_LABELS[t.kind]?.color ?? 'gray'}>{TXN_LABELS[t.kind]?.label ?? t.kind}</Tag>
                  {t.voided && <Tag>تم التراجع</Tag>}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">
                  {dateTimeFmt(t.created_at)}
                  {t.note ? ` • ${t.note}` : ''}
                </div>
              </div>
              <Money v={Math.abs(t.amount)} className={cx('shrink-0 font-bold', t.amount < 0 ? 'text-green' : 'text-ink')} />
            </div>
          ))}
        </div>
      )}
      {paying && <PayModal title={`دفعة للتاجر ${s.name}`} max={s.balance} onClose={() => setPaying(false)} onPay={(a, n) => rpc('supplier_payment', { p_id: s.id, p_amount: a, p_note: n })} success="تم تسجيل الدفعة" hint="الدفعة دي مش بتأثر على فلوس الدرج" />}
    </Modal>
  )
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved?: (id: number) => void }) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    let id = 0
    const ok = await run(async () => {
      id = Number(await rpc('supplier_save', { p_id: supplier?.id ?? null, p_name: name.trim(), p_phone: phone.trim() || null, p_notes: notes.trim() || null }))
    }, 'تم حفظ التاجر')
    setBusy(false)
    if (ok) {
      onSaved?.(id || supplier?.id || 0)
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={supplier ? 'تعديل تاجر' : 'تاجر جديد'}
      footer={
        <Button block loading={busy} disabled={!name.trim()} onClick={save}>
          حفظ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="الاسم">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="التليفون">
          <Input type="tel" dir="ltr" className="text-right" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
