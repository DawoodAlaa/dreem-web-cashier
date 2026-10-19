import { Pencil, Plus, Repeat2, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Chips, Empty, Field, Input, Modal, PageHeader, SearchBox, Tag, TextArea, confirmDialog, cx } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { norm } from '@/lib/format'
import { useShop } from '@/lib/shop'
import { run } from '@/lib/toast'
import type { CompatGroup } from '@/lib/types'

// التوفيقات: معلومات بس (أنهي اسكرينة بتركب على أنهي موبايلات). مش مربوطة بالمنتجات ولا بالبيع.

/** النوع من آخر الاسم، مثلاً "اسكرينة A5 (0.4 حواف)" ← "0.4 حواف" */
const kindOf = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? null
const ALL = '__all'

interface Row {
  g: CompatGroup
  kind: string | null
  key: string
  devKeys: string[]
}

export default function CompatPage() {
  const compat = useShop((s) => s.compat)
  const canEdit = useCan('products')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState(ALL)
  const [edit, setEdit] = useState<CompatGroup | 'new' | null>(null)

  const rows = useMemo<Row[]>(
    () =>
      compat
        .map((g) => ({ g, kind: kindOf(g.name), key: norm(`${g.name} ${g.notes ?? ''}`), devKeys: g.devices.map((d) => norm(d)) }))
        .sort((a, b) => a.g.name.localeCompare(b.g.name, 'en', { numeric: true })),
    [compat],
  )
  const kinds = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.kind) m.set(r.kind, (m.get(r.kind) ?? 0) + 1)
    return [...m.entries()]
  }, [rows])

  const n = norm(q)
  const tokens = n.split(/\s+/).filter(Boolean)
  const list = useMemo(() => {
    return rows.filter((r) => {
      if (kind !== ALL && r.kind !== kind) return false
      if (!tokens.length) return true
      // الجهاز اللي بندوّر عليه لازم كل كلماته تبقى في اسم جهاز واحد (أو في اسم المجموعة)
      return r.devKeys.some((d) => tokens.every((t) => d.includes(t))) || tokens.every((t) => r.key.includes(t))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind, n])

  const del = async (g: CompatGroup) => {
    if (!(await confirmDialog({ title: 'حذف التوفيقة', message: `هتتحذف "${g.name}"`, ok: 'حذف', danger: true }))) return
    await run(() => rpc('delete_compat', { p_id: g.id }), 'تم حذف التوفيقة')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="التوفيقات"
        sub="اكتب اسم موبايل الزبون وشوف أنهي اسكرينة بتركب عليه"
        actions={
          canEdit && (
            <Button icon={<Plus className="h-5 w-5" />} onClick={() => setEdit('new')}>
              توفيقة جديدة
            </Button>
          )
        }
      />
      <div className="mb-3 space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="اسم الموبايل، مثلاً: A54 أو iPhone 13 أو Redmi Note 13" />
        {kinds.length > 1 && (
          <Chips
            value={kind}
            onChange={setKind}
            options={[{ value: ALL, label: 'الكل', count: rows.length }, ...kinds.map(([k, c]) => ({ value: k, label: k, count: c }))]}
          />
        )}
        {q && <div className="text-sm font-bold text-ink-3">{list.length ? `${list.length} نتيجة` : ''}</div>}
      </div>
      {list.length === 0 ? (
        <Empty icon={<Repeat2 />} text={rows.length ? 'مفيش اسكرينة بتركب على الموبايل ده في القايمة' : 'مفيش توفيقات لسه'} />
      ) : (
        <VirtualList
          items={list}
          estimate={110}
          getKey={(r) => r.g.id}
          render={(r) => <GroupCard r={r} tokens={tokens} canEdit={canEdit} onEdit={() => setEdit(r.g)} onDelete={() => del(r.g)} />}
        />
      )}
      {edit && <CompatEditor group={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function GroupCard({ r, tokens, canEdit, onEdit, onDelete }: { r: Row; tokens: string[]; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const [more, setMore] = useState(false)
  const hit = (i: number) => tokens.length > 0 && tokens.every((t) => r.devKeys[i].includes(t))
  // الأجهزة المطابقة الأول
  const order = r.g.devices.map((_, i) => i).sort((a, b) => Number(hit(b)) - Number(hit(a)))
  const LIMIT = 14
  const shown = more ? order : order.slice(0, LIMIT)
  const title = r.kind ? r.g.name.replace(/\s*\([^)]+\)\s*$/, '') : r.g.name
  return (
    <div className="card p-3 lg:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-lg font-extrabold">{title}</span>
          {r.kind && <Tag color={/برايفسي|privacy/i.test(r.kind) ? 'purple' : 'teal'}>{r.kind}</Tag>}
          <span className="text-xs text-ink-3">{r.g.devices.length} جهاز</span>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button type="button" className="icon-btn h-9 w-9" aria-label="تعديل" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" className="icon-btn h-9 w-9 text-red" aria-label="حذف" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((i) => (
          <span key={i} className={cx('tag py-1 text-[13px]', hit(i) ? 'bg-teal text-white' : 'bg-bg text-ink-2')} dir="ltr">
            {r.g.devices[i]}
          </span>
        ))}
        {order.length > LIMIT && (
          <button type="button" className="tag bg-primary-light py-1 text-[13px] text-primary" onClick={() => setMore((m) => !m)}>
            {more ? 'أقل' : `+${order.length - LIMIT} كمان`}
          </button>
        )}
      </div>
      {r.g.notes && <div className="mt-2 text-xs text-ink-3">{r.g.notes}</div>}
    </div>
  )
}

function CompatEditor({ group, onClose }: { group: CompatGroup | null; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [devices, setDevices] = useState<string[]>(group?.devices ?? [])
  const [dev, setDev] = useState('')
  const [notes, setNotes] = useState(group?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const split = (s: string) =>
    s
      .split(/[,،\n/]/)
      .map((x) => x.trim())
      .filter(Boolean)
  const addDevices = () => {
    const parts = split(dev)
    if (!parts.length) return
    setDevices((d) => [...d, ...parts.filter((p) => !d.includes(p))])
    setDev('')
  }
  const all = [...new Set([...devices, ...split(dev)])]
  const save = async () => {
    setBusy(true)
    const ok = await run(
      () => rpc('save_compat', { p_id: group?.id ?? null, p_name: name.trim(), p_base: null, p_devices: all, p_notes: notes.trim() || null }),
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
        <Button block loading={busy} disabled={!name.trim() || !all.length} onClick={save}>
          حفظ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: اسكرينة A5 (0.4 حواف)" />
        </Field>
        <Field label="الموبايلات اللي بتركب عليها" hint="اكتب اسم الموبايل ودوس إضافة (أو افصل بينهم بفاصلة أو /)">
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
            <span key={d} className="tag bg-teal-light py-1 text-sm text-teal" dir="ltr">
              {d}
              <button type="button" aria-label={`شيل ${d}`} onClick={() => setDevices((x) => x.filter((y) => y !== d))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
