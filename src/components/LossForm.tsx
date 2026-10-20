import { useState } from 'react'
import { rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { money, parseInt0, parseNum, variantLabel } from '@/lib/format'
import { LOSS_REASONS, vPrice } from '@/lib/shop'
import { run } from '@/lib/toast'
import type { ProductView, Variant } from '@/lib/types'
import { ProductPicker } from './ProductPicker'
import { Button, Field, Input, Modal, NumInput, Segmented, Select, TextArea } from './ui'

/** تسجيل هالك: من المخزون (منتج ولون وكمية) أو حاجة برة المخزون */
export function LossForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { pv: ProductView; v: Variant } | null }) {
  const showCost = useCan('reports')
  const [src, setSrc] = useState<'stock' | 'free'>('stock')
  const [item, setItem] = useState<{ pv: ProductView; v: Variant } | null>(initial ?? null)
  const [picking, setPicking] = useState(false)
  const [freeName, setFreeName] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState(LOSS_REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const ok = await run(
      () =>
        rpc('add_loss', {
          p_variant: src === 'stock' ? (item?.v.id ?? null) : null,
          p_free_name: src === 'free' ? freeName.trim() : null,
          p_qty: parseInt0(qty) ?? 0,
          p_unit_cost: src === 'free' ? (parseNum(cost) ?? 0) : null,
          p_reason: reason,
          p_note: note.trim() || null,
        }),
      'تم تسجيل الهالك',
    )
    setBusy(false)
    if (ok) onClose()
  }

  const valid = (parseInt0(qty) ?? 0) > 0 && (src === 'stock' ? !!item : !!freeName.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="تسجيل هالك"
      footer={
        <Button block variant="danger" loading={busy} disabled={!valid} onClick={save}>
          تسجيل الهالك
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={src}
          onChange={setSrc}
          options={[
            { value: 'stock', label: 'من المخزون' },
            { value: 'free', label: 'حاجة برة المخزون' },
          ]}
        />
        {src === 'stock' ? (
          <Field label="المنتج">
            <button type="button" className="input flex items-center text-right" onClick={() => setPicking(true)}>
              {item ? (
                <span className="truncate">
                  {variantLabel(item.pv.p.name, item.v.name)}
                  <span className="mr-2 text-xs text-ink-3">{item.v.uncounted ? 'لسه متجردش' : `الكمية ${item.v.stock}`}</span>
                </span>
              ) : (
                <span className="text-ink-3">اختار المنتج</span>
              )}
            </button>
            {item && showCost && <span className="mt-1 block text-xs text-ink-3">سعر الجملة {money(vPrice(item.pv, item.v).cost)} ج.م</span>}
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاسم" className="col-span-2">
              <Input value={freeName} onChange={(e) => setFreeName(e.target.value)} />
            </Field>
            <Field label="تكلفة القطعة">
              <NumInput value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <NumInput decimal={false} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="السبب">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {LOSS_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="ملاحظات">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ProductPicker open={picking} onClose={() => setPicking(false)} onPick={(pv, v) => setItem({ pv, v })} />
    </Modal>
  )
}
