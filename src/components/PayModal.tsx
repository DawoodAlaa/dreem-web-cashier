import { useState } from 'react'
import { EPS, money, parseNum } from '@/lib/format'
import { run } from '@/lib/toast'
import { Button, Field, Input, Modal, NumInput } from './ui'

export function PayModal({
  title,
  max,
  onClose,
  onPay,
  success,
  hint,
}: {
  title: string
  max: number
  onClose: () => void
  onPay: (amount: number, note: string | null) => Promise<unknown>
  success: string
  hint?: string
}) {
  const [amount, setAmount] = useState(money(max).replace(/,/g, ''))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = parseNum(amount) ?? 0
  const err = n <= 0 ? 'اكتب المبلغ' : n > max + EPS ? `المبلغ أكبر من المستحق (${money(max)})` : null
  const save = async () => {
    setBusy(true)
    const ok = await run(() => onPay(n, note.trim() || null), success)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <Button block loading={busy} disabled={!!err} onClick={save}>
          تسجيل
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-ink-3">
          المستحق: <b className="text-ink">{money(max)} ج.م</b>
        </div>
        <Field label="المبلغ" error={amount ? err : null} hint={hint}>
          <NumInput autoFocus className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
