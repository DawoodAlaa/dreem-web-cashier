import { Check, ClipboardCheck, ClipboardList, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ProductImage } from '@/components/ProductForm'
import { Button, Empty, NumInput, PageHeader, SearchBox, Select, Tag, confirmDialog, cx } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { rpc } from '@/lib/api'
import { int, norm, parseInt0 } from '@/lib/format'
import { useShop } from '@/lib/shop'
import { toast, toastError } from '@/lib/toast'
import type { ProductView, Variant } from '@/lib/types'
import { useLive } from '@/lib/useLive'

type Mode = 'initial' | 'periodic'
const SESSION_KEY = 'cd.countSession'

function loadSession(): number[] {
  try {
    const j = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]')
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}
function saveSession(ids: Set<number>) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

interface Row {
  pv: ProductView
  v: Variant
}

export default function InventoryPage() {
  const views = useShop((s) => s.views)
  const categories = useShop((s) => s.categories)
  const [mode, setMode] = useState<Mode>(() => (views.some((v) => v.uncounted) ? 'initial' : 'periodic'))
  const [cat, setCat] = useState(-1)
  const [q, setQ] = useState('')
  const [done, setDone] = useState<Set<number>>(() => new Set(loadSession()))
  const [initialDone, setInitialDone] = useState(0)
  const movement = useLive('uncmov', ['variants', 'invoices', 'adjustments', 'purchases'], async () => {
    const j = await rpc<Record<string, number>>('uncounted_movement')
    return new Map(Object.entries(j ?? {}).map(([k, v]) => [Number(k), Number(v)]))
  })

  const allRows = useMemo(() => {
    const out: Row[] = []
    for (const pv of views) for (const v of pv.vs) out.push({ pv, v })
    return out
  }, [views])
  const uncountedRows = useMemo(() => allRows.filter((r) => r.v.uncounted), [allRows])

  const rows = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean)
    const base = mode === 'initial' ? uncountedRows : allRows.filter((r) => !r.v.uncounted)
    return base.filter((r) => (cat === -1 || r.pv.p.category_id === cat) && t.every((x) => r.pv.key.includes(x)))
  }, [mode, uncountedRows, allRows, cat, q])

  const periodicTotal = allRows.length - uncountedRows.length
  const periodicDone = allRows.filter((r) => !r.v.uncounted && done.has(r.v.id)).length
  const progressDone = mode === 'initial' ? initialDone : periodicDone
  const progressTotal = mode === 'initial' ? uncountedRows.length + initialDone : periodicTotal

  const onCounted = (r: Row) => {
    if (mode === 'initial') setInitialDone((n) => n + 1)
    setDone((s) => {
      const n = new Set(s)
      n.add(r.v.id)
      saveSession(n)
      return n
    })
  }

  const resetSession = async () => {
    if (!(await confirmDialog({ title: 'جرد جديد', message: 'هيبدأ عدّاد الجرد الدوري من الأول (الكميات نفسها مش هتتغير)', ok: 'ابدأ' }))) return
    const n = new Set<number>()
    saveSession(n)
    setDone(n)
  }

  return (
    <div>
      <PageHeader title="جرد المخزون" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setMode('initial')} className={cx('card p-4 text-right transition', mode === 'initial' && 'border-orange ring-2 ring-orange/20')}>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-orange" />
            <span className="font-extrabold">الجرد الأولاني</span>
          </div>
          <div className="mt-1 text-2xl font-extrabold text-orange">{int(uncountedRows.length)}</div>
          <div className="text-xs text-ink-3">منتج لسه متجردش</div>
        </button>
        <button type="button" onClick={() => setMode('periodic')} className={cx('card p-4 text-right transition', mode === 'periodic' && 'border-primary ring-2 ring-primary/20')}>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <span className="font-extrabold">جرد دوري</span>
          </div>
          <div className="mt-1 text-2xl font-extrabold text-primary">{int(periodicTotal)}</div>
          <div className="text-xs text-ink-3">قارن العدد الفعلي باللي في البرنامج</div>
        </button>
      </div>

      <div className="card mb-3 p-3">
        <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
          <span>
            اتجرد <span className="num">{int(progressDone)}</span> من <span className="num">{int(progressTotal)}</span>
          </span>
          {mode === 'periodic' && (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={resetSession}>
              جرد جديد
            </Button>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-bg">
          <div className={cx('h-full rounded-full transition-all', mode === 'initial' ? 'bg-orange' : 'bg-primary')} style={{ width: `${progressTotal ? (progressDone / progressTotal) * 100 : 0}%` }} />
        </div>
        {mode === 'initial' && <div className="mt-2 text-xs text-ink-3">لو المنتج اتباع منه قبل ما يتجرد، اكتب اللي موجود دلوقتي بس، والسيرفر بيحسب الرصيد الافتتاحي (اللي اتعد + اللي اتباع).</div>}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={cat} onChange={(e) => setCat(Number(e.target.value))} className="w-auto min-w-[10rem] flex-none">
          <option value={-1}>كل الأصناف</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <SearchBox value={q} onChange={setQ} className="min-w-[200px] flex-1" />
      </div>

      {rows.length === 0 ? (
        <Empty icon={<ClipboardCheck />} text={mode === 'initial' ? 'كل المنتجات اتجردت' : 'مفيش منتجات مطابقة'} />
      ) : (
        <VirtualList
          items={rows}
          estimate={84}
          getKey={(r) => r.v.id}
          render={(r) => <CountRow r={r} mode={mode} counted={done.has(r.v.id)} moved={movement.data?.get(r.v.id) ?? 0} onCounted={() => onCounted(r)} />}
        />
      )}
    </div>
  )
}

function CountRow({ r, mode, counted, moved, onCounted }: { r: Row; mode: Mode; counted: boolean; moved: number; onCounted: () => void }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const n = parseInt0(val)
  const diff = n == null || mode === 'initial' ? null : n - r.v.stock
  const save = async () => {
    if (n == null || n < 0) return toast('اكتب العدد الموجود', 'error')
    setBusy(true)
    try {
      await rpc('count_stock', { p_variant: r.v.id, p_counted: n })
      toast(diff ? `تم الجرد (${diff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(diff)})` : 'تم الجرد', 'ok', 1500)
      setVal('')
      onCounted()
    } catch (e) {
      toastError(e)
    }
    setBusy(false)
  }
  return (
    <div className={cx('card flex items-center gap-3 p-3', counted && mode === 'periodic' && 'border-green/40 bg-green-light/30')}>
      <ProductImage url={r.pv.p.image_url} className="hidden h-12 w-12 shrink-0 rounded-[10px] sm:flex" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">
          {r.pv.p.name}
          {r.v.name && <span className="text-ink-3"> ({r.v.name})</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {mode === 'periodic' ? <span>في البرنامج: <b className="text-ink-2">{r.v.stock}</b></span> : <Tag color="orange">لسه متجردش</Tag>}
          {mode === 'initial' && moved !== 0 && <span>{moved < 0 ? `اتباع منه ${-moved}` : `اتضاف ${moved}`} قبل الجرد</span>}
          {diff != null && diff !== 0 && <Tag color={diff > 0 ? 'green' : 'red'}>{diff > 0 ? `زيادة ${diff}` : `عجز ${-diff}`}</Tag>}
          {counted && mode === 'periodic' && (
            <span className="flex items-center gap-0.5 font-bold text-green">
              <Check className="h-3.5 w-3.5" /> اتجرد
            </span>
          )}
        </div>
      </div>
      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <NumInput decimal={false} className="w-20 text-center" placeholder="العدد" value={val} onChange={(e) => setVal(e.target.value)} enterKeyHint="done" aria-label="العدد الموجود" />
        <Button type="submit" size="sm" loading={busy} disabled={val === ''} className="w-11 px-0" aria-label="حفظ">
          <Check className="h-5 w-5" />
        </Button>
      </form>
    </div>
  )
}
