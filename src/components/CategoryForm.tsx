import { useState } from 'react'
import { rpc } from '@/lib/api'
import { run } from '@/lib/toast'
import type { Category } from '@/lib/types'
import { CATEGORY_ICONS, CategoryIcon } from './icons'
import { Button, Field, Input, Modal, confirmDialog, cx } from './ui'

export function CategoryForm({ open, onClose, category }: { open: boolean; onClose: () => void; category?: Category | null }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'box')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('category_save', { p_id: category?.id ?? null, p_name: name.trim(), p_icon: icon }), category ? 'تم تعديل الصنف' : 'تم إضافة الصنف')
    setBusy(false)
    if (ok) onClose()
  }
  const del = async () => {
    if (!category) return
    if (!(await confirmDialog({ title: 'حذف الصنف', message: `هيتحذف صنف "${category.name}". لازم يكون مفيهوش منتجات.`, ok: 'حذف', danger: true }))) return
    if (await run(() => rpc('category_delete', { p_id: category.id }), 'تم حذف الصنف')) onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={category ? 'تعديل صنف' : 'صنف جديد'}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} disabled={!name.trim()} onClick={save}>
            حفظ
          </Button>
          {category && (
            <Button variant="danger-soft" onClick={del}>
              حذف
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="اسم الصنف">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الأيقونة">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {Object.entries(CATEGORY_ICONS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                title={v.label}
                onClick={() => setIcon(k)}
                className={cx('flex h-12 items-center justify-center rounded-btn border', icon === k ? 'border-primary bg-primary-light text-primary' : 'border-line text-ink-2')}
              >
                <CategoryIcon icon={k} className="h-6 w-6" />
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
