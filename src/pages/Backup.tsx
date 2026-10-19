import { AlertTriangle, CloudDownload, FileUp, ShieldCheck } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Button, PageHeader, confirmDialog, cx } from '@/components/ui'
import { fetchAll, rpc } from '@/lib/api'
import { dateTimeFmt, daysAgo, ymd } from '@/lib/format'
import { useShop } from '@/lib/shop'
import { starterCaseGroups } from '@/lib/starterCases'
import { supabase } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'

const BACKUP_TABLES = [
  'categories', 'products', 'variants', 'stock_moves', 'product_parts', 'compat_groups', 'compat_devices',
  'used_purchases', 'customers', 'customer_txns', 'invoices', 'invoice_items', 'adjustments', 'adjustment_items',
  'held_carts', 'losses', 'expenses', 'cash_moves', 'settlements', 'suppliers', 'purchases', 'purchase_items',
  'supplier_txns', 'offers', 'offer_items', 'activity_logs', 'app_settings', 'profiles',
]

function Section({ icon, color, title, text, children }: { icon: ReactNode; color: string; title: string; text: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-btn [&>svg]:h-6 [&>svg]:w-6', color)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-extrabold">{title}</div>
          <div className="mt-1 text-sm leading-6 text-ink-2">{text}</div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  )
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function BackupPage() {
  const settings = useShop((s) => s.settings)
  const categories = useShop((s) => s.categories)
  const views = useShop((s) => s.views)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const last = settings.last_cloud_backup
  const days = last ? daysAgo(last) : null
  const late = days == null || days >= 7

  const backup = async () => {
    setBusy('backup')
    setProgress(0)
    try {
      const out: Record<string, unknown> = { format: 'cashier-cloud-backup-v1', created_at: new Date().toISOString() }
      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        const t = BACKUP_TABLES[i]
        out[t] = await fetchAll(() => supabase.from(t).select().order(t === 'app_settings' ? 'key' : 'id'))
        setProgress((i + 1) / BACKUP_TABLES.length)
      }
      download(`نسخة-كاشير-${ymd(new Date())}.json`, out)
      await rpc('save_settings', { p_values: { last_cloud_backup: new Date().toISOString() }, p_description: 'تم تنزيل نسخة احتياطية من كل البيانات' })
      toast('النسخة اتنزلت. احتفظ بيها في مكان أمان (درايف أو واتساب لنفسك)')
    } catch (e) {
      toastError(e)
    }
    setBusy(null)
  }

  const importFile = async (f: File) => {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(await f.text())
      if (!data || data.format !== 'cashier-transfer-v1') throw new Error()
    } catch {
      return toast('الملف ده مش ملف نقل بيانات من البرنامج', 'error')
    }
    const n = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0)
    const ok = await confirmDialog({
      title: 'نقل البيانات',
      message: `الملف فيه ${n('products')} منتج و ${n('customers')} عميل و ${n('suppliers')} تاجر.\nهيتنقلوا بكمياتهم وأرصدتهم. أي منتج أو عميل موجود بنفس الاسم هيتساب زي ما هو.\nالفواتير القديمة مش بتتنقل.`,
      ok: 'نقل',
    })
    if (!ok) return
    setBusy('import')
    try {
      const r = await rpc<{ products: number; skipped: number; categories: number; customers: number; suppliers: number }>('import_data', { p: data })
      toast(`تم نقل ${r.products} منتج و ${r.customers} عميل و ${r.suppliers} تاجر${Number(r.skipped) > 0 ? `\nاتخطينا ${r.skipped} منتج موجود قبل كده` : ''}`)
    } catch (e) {
      toastError(e)
    }
    setBusy(null)
  }

  const starterCases = async () => {
    const caseCat = categories.find((c) => c.icon === 'case') ?? categories.find((c) => c.name === 'جرابات')
    if (!caseCat) return toast('مفيش صنف "جرابات". ضيفه من الإعدادات الأول', 'error')
    const existing = new Set(views.map((v) => v.p.name))
    const groups = starterCaseGroups()
      .map((g) => ({ ...g, names: g.names.filter((n) => !existing.has(n)) }))
      .filter((g) => g.names.length)
    const total = groups.reduce((s, g) => s + g.names.length, 0)
    if (!total) return toast('قايمة الجرابات موجودة بالفعل', 'info')
    const ok = await confirmDialog({
      title: 'قايمة الجرابات الجاهزة',
      message: `هيتضاف ${total} جراب (سامسونج وأوبو وريلمي وريدمي وهواوي وفيفو وإنفينكس وآيفون).\nأندرويد: جملة 40، بيع 70، أقل سعر 50\nآيفون: جملة 50، بيع 150، أقل سعر 75\nالكمية "لسه متجردش" لحد ما تعدهم.`,
      ok: 'إضافة',
    })
    if (!ok) return
    setBusy('cases')
    try {
      for (const g of groups) {
        await rpc('quick_add', {
          p: {
            category_id: caseCat.id,
            cost: g.cost,
            sell: g.sell,
            min_sell: g.minSell,
            min_stock: 1,
            image_url: null,
            uncounted: true,
            items: g.names.map((name) => ({ name, qty: 0 })),
          },
        })
      }
      toast(`تم إضافة ${total} جراب`)
    } catch (e) {
      toastError(e)
    }
    setBusy(null)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="النسخ الاحتياطي" />
      <div className="space-y-4">
        {late && (
          <div className="flex items-center gap-3 rounded-card border border-orange/30 bg-orange-light p-4 text-orange">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <div className="font-bold">{days == null ? 'لسه معملتش نسخة احتياطية. نزّل نسخة دلوقتي.' : `آخر نسخة احتياطية من ${days} يوم. نزّل نسخة جديدة.`}</div>
          </div>
        )}
        <Section
          icon={<CloudDownload />}
          color="bg-primary-light text-primary"
          title="تنزيل نسخة من كل البيانات"
          text={
            <>
              ملف JSON فيه كل حاجة: المنتجات والفواتير والعملاء والحسابات والسجل. احتفظ بيه في مكان أمان.
              <br />
              آخر نسخة: <b>{last ? dateTimeFmt(last) : 'مفيش'}</b>
            </>
          }
        >
          <Button loading={busy === 'backup'} disabled={!!busy} onClick={backup} icon={<CloudDownload className="h-5 w-5" />}>
            {busy === 'backup' ? `جاري التنزيل ${Math.round(progress * 100)}%` : 'تنزيل نسخة'}
          </Button>
          {busy === 'backup' && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </Section>
        <Section
          icon={<FileUp />}
          color="bg-purple-light text-purple"
          title="نقل البيانات من البرنامج القديم"
          text="اختار ملف النقل اللي طلعته من البرنامج القديم (على الكمبيوتر أو التابلت). المنتجات والعملاء والتجار هيتنقلوا بكمياتهم وأرصدتهم."
        >
          <Button variant="soft" loading={busy === 'import'} disabled={!!busy} onClick={() => fileRef.current?.click()} icon={<FileUp className="h-5 w-5" />}>
            اختيار الملف
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void importFile(f)
            }}
          />
        </Section>
        <Section
          icon={<ShieldCheck />}
          color="bg-teal-light text-teal"
          title="إضافة قايمة الجرابات الجاهزة"
          text="231 جراب لأشهر الموبايلات بالأسعار الجاهزة، والكمية لسه متجردش. أي جراب موجود بنفس الاسم بيتخطى."
        >
          <Button variant="soft" loading={busy === 'cases'} disabled={!!busy} onClick={starterCases}>
            إضافة القايمة
          </Button>
        </Section>
      </div>
    </div>
  )
}
