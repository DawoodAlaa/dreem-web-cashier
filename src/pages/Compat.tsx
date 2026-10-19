import { Pencil, Plus, Repeat2, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ProductImage } from '@/components/ProductForm'
import { ProductPicker } from '@/components/ProductPicker'
import { Button, Empty, Field, Input, Modal, PageHeader, SearchBox, Tag, TextArea, confirmDialog } from '@/components/ui'
import { rpc } from '@/lib/api'
import { norm } from '@/lib/format'
import { useShop } from '@/lib/shop'
import { run } from '@/lib/toast'
import type { CompatGroup } from '@/lib/types'

export default function CompatPage() {
  const compat = useShop((s) => s.compat)
  const byId = useShop((s) => s.byId)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<CompatGroup | 'new' | null>(null)
  const list = useMemo(() => {
    const n = norm(q)
    if (!n) return compat
    return compat.filter((g) => norm(g.name).includes(n) || g.devices.some((d) => norm(d).includes(n)) || norm(byId.get(g.base_product_id ?? 0)?.p.name).includes(n))
  }, [compat, q, byId])

  const del = async (g: CompatGroup) => {
    if (!(await confirmDialog({ title: 'حذف التوفيقة', message: `هتتحذف مجموعة "${g.name}"`, ok: 'حذف', danger: true }))) return
    await run(() => rpc('delete_compat', { p_id: g.id }), 'تم حذف التوفيقة')
  }

  return (
    <div>
      <PageHeader
        title="التوفيقات"
        sub="اسكرينة واحدة بتركب على أكتر من جهاز. لما تدور على اسم الجهاز في المبيعات، الاسكرينة بتظهر بعلامة متوافق."
        actions={
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit('new')}>
            توفيقة جديدة
          </Button>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="بحث باسم الجهاز أو المجموعة" className="mb-3" />
      {list.length === 0 ? (
        <Empty icon={<Repeat2 />} text={compat.length ? 'مفيش توفيقات مطابقة' : 'مفيش توفيقات لسه'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => {
            const base = g.base_product_id ? byId.get(g.base_product_id) : null
            return (
              <div key={g.id} className="card min-w-0 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-lg font-extrabold">{g.name}</div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="icon-btn h-9 w-9" aria-label="تعديل" onClick={() => setEdit(g)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="icon-btn h-9 w-9 text-red" aria-label="حذف" onClick={() => del(g)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {base ? (
                  <div className="mt-2 flex items-center gap-2 rounded-btn bg-bg p-2">
                    <ProductImage url={base.p.image_url} className="h-10 w-10 shrink-0 rounded-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{base.p.name}</div>
                      <div className="text-xs text-ink-3">الاسكرينة الأساسية</div>
                    </div>
                    <Tag color={base.outOfStock ? 'red' : 'green'}>{base.allUncounted ? 'لسه متجردش' : `الكمية ${base.stock}`}</Tag>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-orange">مفيش اسكرينة أساسية</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.devices.map((d) => (
                    <Tag key={d} color="teal">
                      {d}
                    </Tag>
                  ))}
                </div>
                {g.notes && <div className="mt-2 text-xs text-ink-3">{g.notes}</div>}
              </div>
            )
          })}
        </div>
      )}
      {edit && <CompatEditor group={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function CompatEditor({ group, onClose }: { group: CompatGroup | null; onClose: () => void }) {
  const byId = useShop((s) => s.byId)
  const [name, setName] = useState(group?.name ?? '')
  const [base, setBase] = useState<number | null>(group?.base_product_id ?? null)
  const [devices, setDevices] = useState<string[]>(group?.devices ?? [])
  const [dev, setDev] = useState('')
  const [notes, setNotes] = useState(group?.notes ?? '')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const addDevices = () => {
    const parts = dev
      .split(/[,،\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (!parts.length) return
    setDevices((d) => [...d, ...parts.filter((p) => !d.includes(p))])
    setDev('')
  }
  const save = async () => {
    const all = dev.trim() ? [...devices, ...dev.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean)] : devices
    setBusy(true)
    const ok = await run(
      () => rpc('save_compat', { p_id: group?.id ?? null, p_name: name.trim(), p_base: base, p_devices: [...new Set(all)], p_notes: notes.trim() || null }),
      'تم حفظ التوفيقة',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={group ? 'تعديل توفيقة' : 'توفيقة جديدة'}
      footer={
        <Button block loading={busy} disabled={!name.trim()} onClick={save}>
          حفظ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="اسم المجموعة">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: اسكرينة A54 / A34" />
        </Field>
        <Field label="الاسكرينة الأساسية (منتج)">
          <button type="button" className="input flex items-center justify-between text-right" onClick={() => setPicking(true)}>
            <span className={base ? '' : 'text-ink-3'}>{base ? (byId.get(base)?.p.name ?? `منتج #${base}`) : 'اختار المنتج'}</span>
            {base && (
              <span
                role="button"
                aria-label="شيل"
                className="text-ink-3"
                onClick={(e) => {
                  e.stopPropagation()
                  setBase(null)
                }}
              >
                <X className="h-4 w-4" />
              </span>
            )}
          </button>
        </Field>
        <Field label="الأجهزة" hint="اكتب اسم الجهاز ودوس إضافة (أو افصل بينهم بفاصلة)">
          <div className="flex gap-2">
            <Input
              value={dev}
              onChange={(e) => setDev(e.target.value)}
              placeholder="مثلاً: A54"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addDevices()
                }
              }}
            />
            <Button variant="soft" onClick={addDevices}>
              إضافة
            </Button>
          </div>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {devices.map((d) => (
            <span key={d} className="tag bg-teal-light py-1 text-sm text-teal">
              {d}
              <button type="button" aria-label="شيل" onClick={() => setDevices((x) => x.filter((y) => y !== d))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <ProductPicker open={picking} onClose={() => setPicking(false)} pickVariant={false} onPick={(pv) => setBase(pv.p.id)} />
    </Modal>
  )
}
