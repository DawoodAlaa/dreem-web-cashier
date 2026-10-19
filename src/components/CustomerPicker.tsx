import { Plus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fetchAll, nums, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { norm } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { Customer } from '@/lib/types'
import { useLive } from '@/lib/useLive'
import { Button, Field, Input, Modal, Money, SearchBox, TextArea, cx } from './ui'

export function useCustomers() {
  return useLive('customers', ['customers', 'customer_txns'], async () => {
    const rows = await fetchAll<Customer>(() => supabase.from('customers_view').select().order('balance', { ascending: false }).order('name'))
    return rows.map((r) => nums(r, ['balance']))
  })
}

export function CustomerForm({
  open,
  onClose,
  customer,
  initialName = '',
  onSaved,
}: {
  open: boolean
  onClose: () => void
  customer?: Customer | null
  initialName?: string
  onSaved?: (id: number, name: string) => void
}) {
  const [name, setName] = useState(customer?.name ?? initialName)
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    let id = 0
    const ok = await run(async () => {
      id = await rpc<number>('customer_save', { p_id: customer?.id || null, p_name: name.trim(), p_phone: phone.trim() || null, p_notes: notes.trim() || null })
    }, customer ? 'تم حفظ بيانات العميل' : 'تم إضافة العميل')
    setBusy(false)
    if (ok) {
      onSaved?.(Number(id) || customer?.id || 0, name.trim())
      onClose()
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={customer ? 'تعديل بيانات العميل' : 'عميل جديد'}
      footer={
        <Button block loading={busy} onClick={save} disabled={!name.trim()}>
          حفظ
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="الاسم">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="التليفون">
          <Input type="tel" inputMode="tel" dir="ltr" className="text-right" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  )
}

export function CustomerPicker({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: number | null; onPick: (c: Customer | null) => void }) {
  const { data } = useCustomers()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const canAdd = useCan('customers') || useCan('credit')
  const list = useMemo(() => {
    const n = norm(q)
    const all = data ?? []
    return n ? all.filter((c) => norm(c.name).includes(n) || (c.phone ?? '').includes(q.trim())) : all
  }, [data, q])
  return (
    <>
      <Modal open={open && !adding} onClose={onClose} title="اختيار العميل">
        <div className="mb-3 flex gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="بحث بالاسم أو التليفون" className="flex-1" />
          {canAdd && (
            <Button variant="soft" icon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)}>
              جديد
            </Button>
          )}
        </div>
        <div className="space-y-1.5">
          <button
            type="button"
            className={cx('flex min-h-12 w-full items-center gap-3 rounded-btn border px-3 text-right', value == null ? 'border-primary bg-primary-light' : 'border-line')}
            onClick={() => {
              onPick(null)
              onClose()
            }}
          >
            <UserRound className="h-5 w-5 text-ink-3" />
            <span className="font-bold text-ink-2">بدون عميل</span>
          </button>
          {list.slice(0, 200).map((c) => (
            <button
              key={c.id}
              type="button"
              className={cx('flex min-h-12 w-full items-center justify-between gap-3 rounded-btn border px-3 py-2 text-right', value === c.id ? 'border-primary bg-primary-light' : 'border-line')}
              onClick={() => {
                onPick(c)
                onClose()
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">{c.name}</span>
                {c.phone && (
                  <span className="block text-xs text-ink-3" dir="ltr">
                    {c.phone}
                  </span>
                )}
              </span>
              {c.balance > 0.005 && (
                <span className="shrink-0 text-sm font-bold text-orange">
                  عليه <Money v={c.balance} />
                </span>
              )}
            </button>
          ))}
          {data && list.length === 0 && <div className="py-6 text-center text-ink-3">مفيش عملاء مطابقين</div>}
        </div>
      </Modal>
      {adding && (
        <CustomerForm
          open
          initialName={q}
          onClose={() => setAdding(false)}
          onSaved={(id, name) => {
            onPick({ id, name, phone: null, notes: null, archived: false, balance: 0, last_move: null, created_at: '' })
            onClose()
          }}
        />
      )}
    </>
  )
}
