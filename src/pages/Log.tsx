import {
  AlertTriangle,
  Banknote,
  HandCoins,
  Boxes,
  History,
  Landmark,
  Package,
  PauseCircle,
  Receipt,
  Repeat,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Empty, ErrorBox, Loading, Modal, PageHeader, RangeFilter, SearchBox, Select, Tag, confirmDialog, cx, type Color } from '@/components/ui'
import { LoadMore, VirtualList } from '@/components/virtual'
import { rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { dateTimeFmt, iso, makeRange, type DateRange } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { ActivityLog } from '@/lib/types'
import { safeSearch, useDebounced, usePaged } from '@/lib/usePaged'
import { useLive } from '@/lib/useLive'

function actionStyle(a: string): { icon: LucideIcon; color: Color } {
  if (a === 'sale') return { icon: ShoppingCart, color: 'green' }
  if (a === 'return') return { icon: RotateCcw, color: 'red' }
  if (a === 'exchange') return { icon: Repeat, color: 'purple' }
  if (a.startsWith('hold')) return { icon: PauseCircle, color: 'gray' }
  if (a === 'expense') return { icon: Wallet, color: 'red' }
  if (a === 'loss') return { icon: AlertTriangle, color: 'orange' }
  if (a.includes('payment')) return { icon: Banknote, color: 'teal' }
  if (a === 'settlement' || a === 'deposit') return { icon: Landmark, color: 'primary' }
  if (a.startsWith('purchase') || a.startsWith('supplier')) return { icon: Truck, color: 'purple' }
  if (a.includes('stock') || a.includes('count') || a.includes('split') || a.includes('assemble')) return { icon: Boxes, color: 'orange' }
  if (a.startsWith('product') || a.includes('price') || a.includes('offer') || a.includes('compat') || a.includes('category') || a.includes('parts') || a === 'used_buy')
    return { icon: Package, color: 'primary' }
  if (a === 'settings') return { icon: Settings, color: 'gray' }
  if (a === 'member' || a.startsWith('shop')) return { icon: UserCog, color: 'gray' }
  if (a === 'undo') return { icon: Undo2, color: 'red' }
  if (a.startsWith('salary')) return { icon: HandCoins, color: 'teal' }
  return { icon: Receipt, color: 'gray' }
}

const iconBg: Record<Color, string> = {
  green: 'bg-green-light text-green',
  red: 'bg-red-light text-red',
  orange: 'bg-orange-light text-orange',
  purple: 'bg-purple-light text-purple',
  teal: 'bg-teal-light text-teal',
  primary: 'bg-primary-light text-primary',
  gray: 'bg-bg text-ink-3',
}

export default function LogPage() {
  const [range, setRange] = useState<DateRange>(() => makeRange('today'))
  const [section, setSection] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<ActivityLog | null>(null)
  const search = useDebounced(q)
  const rk = `${iso(range.from)}:${iso(range.to)}`
  const paged = usePaged<ActivityLog>(
    `log:${rk}:${section}:${type}:${search}`,
    ['activity_logs'],
    async () => {
      let qb = supabase
        .from('activity_logs')
        .select('id, action, section, title, description, details, undoable, status, undone_at, undo_of, user_name, created_at', { count: 'exact' })
        .gte('created_at', iso(range.from))
        .lt('created_at', iso(range.to))
      if (section) qb = qb.eq('section', section)
      if (type) qb = qb.eq('title', type)
      const s = safeSearch(search)
      if (s) qb = qb.or(`title.ilike.*${s}*,description.ilike.*${s}*,user_name.ilike.*${s}*`)
      return { q: qb.order('id', { ascending: false }) }
    },
    undefined,
    100,
  )
  // الأقسام وأنواع العمليات في الفترة كلها (من السيرفر، مش من اللي اتحمّل بس)
  const facets = useLive(`logfacets:${rk}`, ['activity_logs'], async () => (await rpc<{ section: string; title: string; n: number }[]>('log_facets', { p_from: iso(range.from), p_to: iso(range.to) })) ?? [])
  const fx = facets.data ?? []
  const sections = useMemo(() => [...new Set(fx.map((x) => x.section))].sort(), [fx])
  const types = useMemo(() => [...new Set(fx.filter((x) => !section || x.section === section).map((x) => x.title))].sort(), [fx, section])
  const list = paged.rows
  const current = open ? (list.find((l) => l.id === open.id) ?? open) : null

  return (
    <div>
      <PageHeader title="السجل" sub="كل عملية بتتسجل ومعاها اسم اللي عملها" />
      <div className="mb-3 space-y-2">
        <RangeFilter value={range} onChange={setRange} />
        <div className="flex flex-wrap gap-2">
          <Select
            value={section}
            onChange={(e) => {
              setSection(e.target.value)
              setType('')
            }}
            className="w-auto min-w-[9rem] flex-1 sm:flex-none"
          >
            <option value="">كل الأقسام</option>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto min-w-[9rem] flex-1 sm:flex-none">
            <option value="">كل العمليات</option>
            {types.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <SearchBox value={q} onChange={setQ} className="min-w-[200px] flex-[2]" />
        </div>
      </div>
      {paged.total != null && list.length > 0 && <div className="mb-2 text-sm font-bold text-ink-3">{paged.total} عملية</div>}
      {paged.error && !list.length ? (
        <ErrorBox text={paged.error} onRetry={paged.reload} />
      ) : paged.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={<History />} text={section || type || search ? 'مفيش عمليات مطابقة' : 'مفيش عمليات في الفترة دي'} />
      ) : (
        <>
        <VirtualList
          items={list}
          estimate={82}
          getKey={(l) => l.id}
          render={(l) => {
            const st = actionStyle(l.action)
            const I = st.icon
            return (
              <button type="button" onClick={() => setOpen(l)} className={cx('card flex w-full items-start gap-3 p-3 text-right hover:border-primary/40', l.status === 'undone' && 'opacity-60')}>
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-btn', iconBg[st.color])}>
                  <I className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-extrabold">{l.title}</span>
                    <Tag color="gray">{l.section}</Tag>
                    {l.status === 'undone' && <Tag color="red">تم التراجع</Tag>}
                  </div>
                  <div className="line-clamp-2 whitespace-pre-line text-sm text-ink-2">{l.description}</div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    {dateTimeFmt(l.created_at)}
                    {l.user_name ? ` • ${l.user_name}` : ''}
                  </div>
                </div>
              </button>
            )
          }}
        />
        <LoadMore hasMore={paged.hasMore} loading={paged.loadingMore} onMore={paged.loadMore} shown={list.length} total={paged.total} />
        </>
      )}
      {current && <LogDetail l={current} onClose={() => setOpen(null)} />}
    </div>
  )
}

function LogDetail({ l, onClose }: { l: ActivityLog; onClose: () => void }) {
  const canUndo = useCan('undo')
  const [busy, setBusy] = useState(false)
  const undo = async () => {
    const ok = await confirmDialog({
      title: 'تراجع عن العملية',
      message: `متأكد إنك عايز تتراجع عن "${l.title}"؟\nكل اللي العملية عملته (المخزون والفلوس) هيرجع زي ما كان.`,
      ok: 'تراجع',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    const done = await run(() => rpc('undo', { p_op: l.id }), 'تم التراجع عن العملية')
    setBusy(false)
    if (done) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={l.title}
      footer={
        l.undoable && l.status === 'done' && canUndo ? (
          <Button block variant="danger-soft" loading={busy} icon={<Undo2 className="h-5 w-5" />} onClick={undo}>
            تراجع
          </Button>
        ) : undefined
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Tag color="gray">{l.section}</Tag>
        {l.status === 'undone' ? <Tag color="red">تم التراجع {l.undone_at ? `• ${dateTimeFmt(l.undone_at)}` : ''}</Tag> : <Tag color="green">تمت</Tag>}
        <span className="text-ink-3">
          {dateTimeFmt(l.created_at)}
          {l.user_name ? ` • ${l.user_name}` : ''}
        </span>
      </div>
      <div className="mb-3 whitespace-pre-line rounded-btn bg-bg px-3 py-2.5 text-[15px] leading-7">{l.description}</div>
      {l.details && l.details.length > 0 && (
        <div className="divide-y divide-line-soft rounded-btn border border-line-soft">
          {l.details.map(([k, v], i) => (
            <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="shrink-0 text-sm text-ink-3">{k}</span>
              <span className="whitespace-pre-line text-left text-sm font-bold text-ink-2">{v}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
