import { Camera, ImageOff, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { EPS, money, parseInt0, parseNum } from '@/lib/format'
import { uploadProductImage } from '@/lib/images'
import { useShop } from '@/lib/shop'
import { run, toastError } from '@/lib/toast'
import type { ProductView } from '@/lib/types'
import { Button, Checkbox, Field, Input, Modal, NumInput, Select, Spinner, TextArea, cx } from './ui'

interface VRow {
  id: number | null
  name: string
  stock: string
  uncounted: boolean
  // سعر النوع لو مختلف عن المنتج ('' = سعر المنتج)
  cost: string
  sell: string
  minSell: string
}

const emptyRow = (stock = '0'): VRow => ({ id: null, name: '', stock, uncounted: false, cost: '', sell: '', minSell: '' })
const priceStr = (v: number | null | undefined) => (v == null ? '' : money(v).replace(/,/g, ''))

export function ProductImage({ url, className, icon }: { url: string | null; className?: string; icon?: React.ReactNode }) {
  const [err, setErr] = useState(false)
  if (!url || err) return <div className={cx('flex items-center justify-center bg-bg text-ink-3', className)}>{icon ?? <ImageOff className="h-6 w-6 opacity-50" />}</div>
  return <img src={url} alt="" loading="lazy" decoding="async" onError={() => setErr(true)} className={cx('bg-bg object-cover', className)} />
}

export function ImagePicker({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <ProductImage url={value} className="h-20 w-20 shrink-0 rounded-btn border border-line" />
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" size="sm" icon={busy ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />} disabled={busy} onClick={() => ref.current?.click()}>
          {value ? 'تغيير الصورة' : 'إضافة صورة'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            شيل الصورة
          </Button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          try {
            onChange(await uploadProductImage(f))
          } catch (err) {
            toastError(err)
          }
          setBusy(false)
        }}
      />
    </div>
  )
}

export function ProductForm({
  open,
  onClose,
  product,
  defaultCategory,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  product?: ProductView | null
  defaultCategory?: number | null
  onSaved?: (id: number) => void
}) {
  const categories = useShop((s) => s.categories)
  const showCost = useCan('reports')
  const p = product?.p
  const [cat, setCat] = useState<number>(p?.category_id ?? defaultCategory ?? categories[0]?.id ?? 0)
  const [name, setName] = useState(p?.name ?? '')
  const [image, setImage] = useState<string | null>(p?.image_url ?? null)
  const [cost, setCost] = useState(p ? money(p.cost_price).replace(/,/g, '') : '')
  const [sell, setSell] = useState(p ? money(p.sell_price).replace(/,/g, '') : '')
  const [minSell, setMinSell] = useState(p ? money(p.min_sell_price).replace(/,/g, '') : '')
  const [minStock, setMinStock] = useState(p ? String(p.min_stock) : '1')
  const [imei, setImei] = useState(p?.imei ?? '')
  const [notes, setNotes] = useState(p?.notes ?? '')
  const [uncounted, setUncounted] = useState(product ? product.allUncounted : false)
  const [colors, setColors] = useState(product ? product.hasVariants : false)
  const [rows, setRows] = useState<VRow[]>(
    product
      ? product.vs.map((v) => ({
          id: v.id,
          name: v.name ?? '',
          stock: String(v.stock),
          uncounted: v.uncounted,
          cost: priceStr(v.cost_price),
          sell: priceStr(v.sell_price),
          minSell: priceStr(v.min_sell_price),
        }))
      : [emptyRow('1')],
  )
  const [busy, setBusy] = useState(false)

  const sellN = parseNum(sell)
  const minN = parseNum(minSell)
  const minErr = sellN != null && minN != null && minN > sellN + EPS ? 'أقل سعر لازم يبقى أقل من أو يساوي سعر البيع' : null
  // سعر كل نوع: الفاضي بياخد سعر المنتج
  const rowPrice = (r: VRow) => ({
    cost: r.cost.trim() ? parseNum(r.cost) : null,
    sell: r.sell.trim() ? parseNum(r.sell) : null,
    min_sell: r.minSell.trim() ? parseNum(r.minSell) : null,
  })
  const rowErr = (r: VRow) => {
    const x = rowPrice(r)
    if ((x.sell != null && x.sell <= 0) || (x.cost != null && x.cost < 0) || (x.min_sell != null && x.min_sell < 0)) return 'السعر غلط'
    const effSell = x.sell ?? sellN ?? 0
    const effMin = x.min_sell ?? minN ?? sellN ?? 0
    return effMin > effSell + EPS ? 'أقل سعر أكبر من سعر البيع' : null
  }
  const variantsErr = colors && rows.some((r) => rowErr(r))

  const setRow = (i: number, patch: Partial<VRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    const list = colors ? rows : rows.slice(0, 1).map((r) => ({ ...r, name: '', cost: '', sell: '', minSell: '' }))
    const payload = {
      category_id: cat,
      name: name.trim(),
      cost: showCost ? (parseNum(cost) ?? 0) : (p?.cost_price ?? 0),
      sell: sellN ?? 0,
      min_sell: minN ?? sellN ?? 0,
      image_url: image,
      min_stock: parseInt0(minStock) ?? 0,
      notes: notes.trim() || null,
      imei: imei.trim() || null,
      is_used: p?.is_used ?? false,
      uncounted,
      variants: list.map((r) => ({ id: r.id, name: r.name.trim() || null, stock: parseInt0(r.stock) ?? 0, uncounted: r.id ? r.uncounted : uncounted, ...rowPrice(r) })),
    }
    setBusy(true)
    let id = p?.id ?? 0
    const ok = await run(async () => {
      if (p) await rpc('edit_product', { p_id: p.id, p: payload })
      else id = Number(await rpc<number>('add_product', { p: payload }))
    }, p ? 'تم حفظ التعديلات' : 'تم إضافة المنتج')
    setBusy(false)
    if (ok) {
      onSaved?.(id)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={p ? 'تعديل منتج' : 'إضافة منتج'}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} onClick={save} disabled={!name.trim() || !sellN || !!minErr || variantsErr}>
            حفظ
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="الصنف">
            <Select value={cat} onChange={(e) => setCat(Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="اسم المنتج">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!p} />
          </Field>
        </div>
        <Field label="الصورة">
          <ImagePicker value={image} onChange={setImage} />
        </Field>
        <div className={cx('grid gap-3', showCost ? 'grid-cols-3' : 'grid-cols-2')}>
          {showCost && (
            <Field label="سعر الجملة">
              <NumInput value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          )}
          <Field label="سعر البيع">
            <NumInput value={sell} onChange={(e) => setSell(e.target.value)} />
          </Field>
          <Field label="أقل سعر بيع">
            <NumInput value={minSell} onChange={(e) => setMinSell(e.target.value)} placeholder={sell} />
          </Field>
        </div>
        {minErr && <div className="-mt-2 text-xs font-bold text-red">{minErr}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="حد التنبيه" hint="يظهر في الجرس لما الكمية توصله">
            <NumInput decimal={false} value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </Field>
          <Field label="IMEI (اختياري)">
            <Input dir="ltr" className="text-right" value={imei} onChange={(e) => setImei(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-card border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox checked={colors} onChange={setColors} label="المنتج ليه ألوان / أنواع" />
            {!p && <Checkbox checked={uncounted} onChange={setUncounted} label="الكمية هتتجرد بعدين" />}
          </div>
          {colors ? (
            <div className="mt-2 space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="rounded-btn bg-bg p-2">
                <div className="flex items-center gap-2">
                  <Input className="flex-1" placeholder="النوع أو اللون (مثلاً أسود أو مستورد)" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                  {r.uncounted || (!r.id && uncounted) ? (
                    <span className="w-24 shrink-0 text-center text-xs font-bold text-orange">لسه متجردش</span>
                  ) : (
                    <NumInput decimal={false} className="w-24 shrink-0" placeholder="الكمية" value={r.stock} onChange={(e) => setRow(i, { stock: e.target.value })} />
                  )}
                  <button
                    type="button"
                    aria-label="حذف اللون"
                    className="icon-btn text-red"
                    disabled={rows.length === 1}
                    onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className={cx('mt-2 grid gap-2', showCost ? 'grid-cols-3' : 'grid-cols-2')}>
                  {showCost && <NumInput className="h-10 lg:h-10" placeholder={`جملة ${cost || '—'}`} value={r.cost} onChange={(e) => setRow(i, { cost: e.target.value })} aria-label="سعر الجملة للنوع" />}
                  <NumInput className="h-10 lg:h-10" placeholder={`بيع ${sell || '—'}`} value={r.sell} onChange={(e) => setRow(i, { sell: e.target.value })} aria-label="سعر البيع للنوع" />
                  <NumInput className="h-10 lg:h-10" placeholder={`أقل ${minSell || sell || '—'}`} value={r.minSell} onChange={(e) => setRow(i, { minSell: e.target.value })} aria-label="أقل سعر للنوع" />
                </div>
                {rowErr(r) && <div className="mt-1 text-xs font-bold text-red">{rowErr(r)}</div>}
                </div>
              ))}
              <div className="text-xs text-ink-3">لو النوع سعره زي المنتج سيب خانات السعر فاضية</div>
              <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((x) => [...x, emptyRow()])}>
                نوع تاني
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              {rows[0].uncounted || (!rows[0].id && uncounted) ? (
                <div className="text-sm font-bold text-orange">الكمية: لسه متجردش (هتتحدد في الجرد)</div>
              ) : (
                <Field label="الكمية">
                  <NumInput decimal={false} value={rows[0].stock} onChange={(e) => setRow(0, { stock: e.target.value })} />
                </Field>
              )}
            </div>
          )}
        </div>

        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
