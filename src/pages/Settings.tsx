import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { CategoryForm } from '@/components/CategoryForm'
import { CategoryIcon } from '@/components/icons'
import { Button, Checkbox, Field, Input, NumInput, PageHeader, Segmented, confirmDialog } from '@/components/ui'
import { AppError, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { parseInt0 } from '@/lib/format'
import { expenseCategories, splitCategories, splitHeadRatio, useShop, useTrackStock } from '@/lib/shop'
import { run, toast } from '@/lib/toast'
import type { Category } from '@/lib/types'

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="card p-4 lg:p-5">
      <div className="mb-3">
        <div className="text-lg font-extrabold">{title}</div>
        {sub && <div className="text-sm text-ink-3">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const canProducts = useCan('products')
  const track = useTrackStock()
  return (
    <div>
      <PageHeader title="الإعدادات" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ShopInfo />
        {canProducts && <Categories />}
        <StockSettings />
        <ExpenseCats />
        {track && <ChargerSettings />}
      </div>
    </div>
  )
}

function StockSettings() {
  const track = useTrackStock()
  const [busy, setBusy] = useState(false)
  const change = async (on: boolean) => {
    if (on === track) return
    const ok = await confirmDialog(
      on
        ? { title: 'تشغيل متابعة الكميات', message: 'الجرد والمشتريات هيرجعوا، وكل المنتجات هتبقى "لسه متجردش" لحد ما تعدّها من صفحة الجرد.', ok: 'تشغيل' }
        : { title: 'إيقاف متابعة الكميات', message: 'الكميات هتتشال من كل المنتجات، والبيع مش هيتقيد بالكمية. الجرد والمشتريات هيختفوا. الفواتير والهالك هيفضلوا يسجلوا عدد القطع عادي.', ok: 'إيقاف', danger: true },
    )
    if (!ok) return
    setBusy(true)
    await run(() => rpc('set_track_stock', { p_on: on }), on ? 'متابعة الكميات اشتغلت' : 'متابعة الكميات اتقفلت')
    setBusy(false)
  }
  return (
    <Section title="متابعة الكميات" sub="لو مش محتاج تعرف الموجود من كل منتج، اقفلها: البيع هيبقى من غير كميات، وعدد اللي اتباع والهالك بيتسجل عادي">
      <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
        <Segmented
          value={track ? 'on' : 'off'}
          onChange={(v) => void change(v === 'on')}
          options={[
            { value: 'on', label: 'شغالة' },
            { value: 'off', label: 'مقفولة' },
          ]}
        />
      </div>
    </Section>
  )
}

function ShopInfo() {
  const settings = useShop((s) => s.settings)
  const [name, setName] = useState(settings.shop_name ?? '')
  const [sub, setSub] = useState(settings.shop_sub ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setName(settings.shop_name ?? '')
    setSub(settings.shop_sub ?? '')
  }, [settings.shop_name, settings.shop_sub])
  const save = async () => {
    setBusy(true)
    await run(() => rpc('save_settings', { p_values: { shop_name: name.trim(), shop_sub: sub.trim() }, p_description: 'تم تحديث بيانات المحل' }), 'تم حفظ بيانات المحل')
    setBusy(false)
  }
  return (
    <Section title="بيانات المحل">
      <div className="space-y-3">
        <Field label="اسم المحل">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الوصف" hint="بيظهر تحت اسم المحل (مثلاً العنوان أو رقم التليفون)">
          <Input value={sub} onChange={(e) => setSub(e.target.value)} />
        </Field>
        <Button loading={busy} disabled={!name.trim()} onClick={save}>
          حفظ
        </Button>
      </div>
    </Section>
  )
}

function Categories() {
  const categories = useShop((s) => s.categories)
  const views = useShop((s) => s.views)
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  const del = async (c: Category) => {
    await run(() => rpc('category_delete', { p_id: c.id }), 'تم حذف الصنف')
  }
  return (
    <Section title="أصناف المنتجات">
      <div className="divide-y divide-line-soft">
        {categories.map((c) => {
          const n = views.filter((v) => v.p.category_id === c.id).length
          return (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary-light text-primary">
                <CategoryIcon icon={c.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{c.name}</span>
                <span className="block text-xs text-ink-3">{n} منتج</span>
              </span>
              <button type="button" className="icon-btn" aria-label="تعديل" onClick={() => setEdit(c)}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" className="icon-btn text-red disabled:opacity-30" aria-label="حذف" disabled={n > 0} title={n > 0 ? 'فيه منتجات' : 'حذف'} onClick={() => del(c)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
      <Button variant="soft" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>
        صنف جديد
      </Button>
      {edit && <CategoryForm open category={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Section>
  )
}

function ExpenseCats() {
  const settings = useShop((s) => s.settings)
  const [list, setList] = useState(() => expenseCategories(settings))
  const [add, setAdd] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setList(expenseCategories(settings)), [settings])
  const save = async (next: string[]) => {
    setBusy(true)
    const ok = await run(() => rpc('save_settings', { p_values: { expense_categories: JSON.stringify(next) }, p_description: 'تم تحديث فئات المصاريف' }), 'تم حفظ فئات المصاريف')
    if (ok) setList(next)
    setBusy(false)
  }
  return (
    <Section title="فئات المصاريف">
      <div className="mb-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <span key={c} className="tag bg-bg py-1.5 pl-1.5 text-sm text-ink-2">
            {c}
            <button type="button" aria-label={`شيل ${c}`} disabled={busy || list.length <= 1} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-red-light hover:text-red" onClick={() => save(list.filter((x) => x !== c))}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = add.trim()
          if (!v) return
          if (list.includes(v)) return toast('الفئة دي موجودة', 'error')
          void save([...list, v]).then(() => setAdd(''))
        }}
      >
        <Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="فئة جديدة" />
        <Button type="submit" variant="soft" loading={busy} disabled={!add.trim()}>
          إضافة
        </Button>
      </form>
    </Section>
  )
}

function ChargerSettings() {
  const settings = useShop((s) => s.settings)
  const categories = useShop((s) => s.categories)
  const [cats, setCats] = useState<Set<number>>(() => new Set(splitCategories(settings, categories)))
  const [ratio, setRatio] = useState(String(splitHeadRatio(settings)))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setCats(new Set(splitCategories(settings, categories)))
    setRatio(String(splitHeadRatio(settings)))
  }, [settings, categories])
  const save = async () => {
    const r = parseInt0(ratio) ?? 0
    setBusy(true)
    let n = 0
    const ok = await run(async () => {
      if (r < 1 || r > 99) throw new AppError('النسبة لازم تبقى بين 1 و 99')
      await rpc('save_settings', { p_values: { split_categories: JSON.stringify([...cats]), split_head_ratio: String(r) }, p_description: 'تم تحديث إعدادات فك الشواحن' })
      n = Number(await rpc('ensure_auto_parts').catch(() => 0)) || 0
    })
    setBusy(false)
    if (ok) toast(n > 0 ? `تم الحفظ وتجهيز الراس والوصلة لـ ${n} منتج` : 'تم الحفظ')
  }
  return (
    <Section title="إعدادات الشواحن" sub="المنتجات في الأصناف دي بيتعملها راس ووصلة تلقائي، وبيتفكوا وقت البيع">
      <div className="mb-3">
        {categories.map((c) => (
          <Checkbox
            key={c.id}
            checked={cats.has(c.id)}
            onChange={(v) =>
              setCats((s) => {
                const n = new Set(s)
                if (v) n.add(c.id)
                else n.delete(c.id)
                return n
              })
            }
            label={c.name}
          />
        ))}
      </div>
      <Field label="سعر الراس من سعر الشاحن (%)" hint="الوصلة بتاخد الباقي. الافتراضي 60%">
        <NumInput decimal={false} value={ratio} onChange={(e) => setRatio(e.target.value)} className="w-32" />
      </Field>
      <Button className="mt-3" loading={busy} onClick={save}>
        حفظ
      </Button>
    </Section>
  )
}
