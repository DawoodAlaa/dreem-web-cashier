import { AlertTriangle, ChevronLeft, HandCoins, Landmark, ListTodo, PackageX, ShoppingCart, TrendingUp, UserRound, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { actionStyle, iconBg } from '@/components/logStyle'
import { Empty, ErrorBox, Loading, Money, cx } from '@/components/ui'
import { fetchAll, nums, rpc } from '@/lib/api'
import { useAuth, useCan } from '@/lib/auth'
import { int, iso, makeRange, money, timeFmt } from '@/lib/format'
import { canOpen, go, type PageId } from '@/lib/nav'
import { onStatus } from '@/lib/realtime'
import { useShortageCount } from '@/lib/shortages'
import { useShop, useTrackStock } from '@/lib/shop'
import { supabase } from '@/lib/supabase'
import type { ActivityLog, ProfitReport } from '@/lib/types'
import { useLive } from '@/lib/useLive'

// النهارده: كل حاجة مهمة في شاشة واحدة، وبتتحدث لوحدها لحظة بلحظة (عشان صاحب المحل يتابع من أي مكان)

interface InvRow {
  id: number
  total: number
  user_name: string | null
  voided: boolean
  created_at: string
}

const dayTitle = () =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(new Date())

/** "دلوقتي"، "من 5 دقايق"، "من ساعة"، وبعد كده الساعة */
function ago(ts: string, now: number): string {
  const m = Math.floor((now - new Date(ts).getTime()) / 60000)
  if (m < 1) return 'دلوقتي'
  if (m === 1) return 'من دقيقة'
  if (m === 2) return 'من دقيقتين'
  if (m <= 10) return `من ${m} دقايق`
  if (m < 60) return `من ${m} دقيقة`
  if (m < 120) return 'من ساعة'
  return timeFmt(ts)
}

function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [every])
  return now
}

function useLiveStatus() {
  const [on, setOn] = useState(true)
  useEffect(() => onStatus(setOn), [])
  return on
}

export default function TodayPage() {
  const profile = useAuth((s) => s.profile)
  const canSell = useCan('sell')
  const canReturns = useCan('returns')
  const canSales = canSell || canReturns
  const canReports = useCan('reports')
  const canDrawer = useCan('drawer')
  const canSalaries = useCan('salaries')
  const canLog = useCan('log')
  const now = useNow()
  const live = useLiveStatus()
  const today = makeRange('today')
  const rk = `${iso(today.from)}:${iso(today.to)}`
  const span = { p_from: iso(today.from), p_to: iso(today.to) }

  const invoices = useLive(canSales ? `today-inv:${rk}` : null, ['invoices'], async () => {
    const rows = await fetchAll<InvRow>(() =>
      supabase.from('invoices').select('id, total, user_name, voided, created_at').gte('created_at', span.p_from).lt('created_at', span.p_to).order('id'),
    )
    return rows.map((r) => nums(r, ['total']))
  })
  const summary = useLive(canSales ? `today-sum:${rk}` : null, ['invoices', 'adjustments'], async () => {
    const r = await rpc<{ count: number; net: number }>('invoices_summary', span)
    return { count: Number(r.count) || 0, net: Number(r.net) || 0 }
  })
  const profit = useLive(canReports ? `today-profit:${rk}` : null, ['invoices', 'adjustments', 'expenses', 'losses'], async () => {
    const r = await rpc<ProfitReport>('profit_report', span)
    const n = (x: unknown) => Number(x) || 0
    const gross = n(r.revenue) - n(r.cost)
    return { gross, expenses: n(r.expenses), losses: n(r.losses), net: gross - n(r.expenses) - n(r.losses) }
  })
  const cash = useLive(canDrawer ? 'cash_balance' : null, ['cash_moves'], async () => Number(await rpc('cash_balance')))
  const salary = useLive(canSalaries ? 'salary_balance' : null, ['salary_moves'], async () => Number(await rpc('salary_balance')))
  const feed = useLive(canLog ? `today-feed:${rk}` : null, ['activity_logs'], async () => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('id, action, title, description, status, user_name, created_at')
      .gte('created_at', span.p_from)
      .lt('created_at', span.p_to)
      .order('id', { ascending: false })
      .limit(15)
    if (error) throw error
    return data as Pick<ActivityLog, 'id' | 'action' | 'title' | 'description' | 'status' | 'user_name' | 'created_at'>[]
  })

  // مين باع كام النهارده
  const staff = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const r of invoices.data ?? []) {
      if (r.voided) continue
      const k = r.user_name || '-'
      const x = m.get(k) ?? { count: 0, total: 0 }
      x.count++
      x.total += r.total
      m.set(k, x)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [invoices.data])
  const lastSale = useMemo(() => (invoices.data ?? []).filter((r) => !r.voided).at(-1)?.created_at ?? null, [invoices.data])
  const maxStaff = staff[0]?.[1].total || 1

  // المخزون (من الكتالوج اللي متحمّل)
  const views = useShop((s) => s.views)
  const stock = useMemo(() => {
    let low = 0
    let out = 0
    for (const v of views) {
      if (v.p.is_used || v.allUncounted) continue
      if (v.outOfStock) out++
      else if (v.isLow) low++
    }
    return { low, out }
  }, [views])
  const shortages = useShortageCount()
  const track = useTrackStock()
  const open = (p: PageId) => canOpen(p, profile) && go(p)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="hidden text-2xl font-extrabold lg:block">النهارده</h1>
          <div className="text-[15px] font-bold text-ink-2 lg:text-sm lg:font-normal lg:text-ink-3">{dayTitle()}</div>
        </div>
        <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold', live ? 'bg-green-light text-green' : 'bg-bg text-ink-3')}>
          <span className={cx('h-2 w-2 rounded-full', live ? 'animate-pulse bg-green' : 'bg-ink-3')} />
          {live ? 'مباشر' : 'بيتوصل...'}
        </span>
      </div>

      {/* المبيعات */}
      {canSales && (
        <button
          type="button"
          onClick={() => open('invoices')}
          className="block w-full rounded-card bg-gradient-to-br from-[#2a86ff] to-primary-dark p-5 text-right text-white shadow-card active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-white/85">
              <ShoppingCart className="h-5 w-5" />
              مبيعات النهارده
            </span>
            <ChevronLeft className="h-5 w-5 text-white/70" />
          </div>
          <div className="mt-1 text-4xl font-extrabold">{summary.data ? <Money v={summary.data.net} /> : '...'}</div>
          <div className="mt-1 text-sm text-white/85">
            {summary.data ? `${int(summary.data.count)} فاتورة` : ''}
            {lastSale && ` • آخر بيعة ${ago(lastSale, now)}`}
          </div>
        </button>
      )}

      {/* الأرقام */}
      {(canReports || canDrawer || canSalaries) && (
        <div className="grid grid-cols-2 gap-3">
          {canReports && (
            <Tile
              icon={<TrendingUp className="h-5 w-5" />}
              label="صافي الربح"
              color={profit.data && profit.data.net < 0 ? 'red' : 'green'}
              value={profit.data ? <Money v={profit.data.net} /> : '...'}
              sub={profit.data ? `مكسب البيع ${money(profit.data.gross)}` : undefined}
              onClick={() => open('reports')}
            />
          )}
          {canReports && (
            <Tile
              icon={<Wallet className="h-5 w-5" />}
              label="المصاريف"
              color="red"
              value={profit.data ? <Money v={profit.data.expenses} /> : '...'}
              sub={profit.data && profit.data.losses > 0 ? `وهالك ${money(profit.data.losses)}` : undefined}
              onClick={() => open('expenses')}
            />
          )}
          {canDrawer && <Tile icon={<Landmark className="h-5 w-5" />} label="الدرج دلوقتي" color="primary" value={cash.data == null ? '...' : <Money v={cash.data} />} onClick={() => open('drawer')} />}
          {canSalaries && <Tile icon={<HandCoins className="h-5 w-5" />} label="درج المرتبات" color="teal" value={salary.data == null ? '...' : <Money v={salary.data} />} onClick={() => open('salaries')} />}
        </div>
      )}

      {/* المخزون */}
      <div className={cx('grid gap-2', track ? 'grid-cols-3' : 'grid-cols-1')}>
        {track && <MiniTile icon={<PackageX className="h-5 w-5" />} label="خلص" n={stock.out} color="red" onClick={() => open('products')} />}
        {track && <MiniTile icon={<AlertTriangle className="h-5 w-5" />} label="قرب يخلص" n={stock.low} color="orange" onClick={() => open('products')} />}
        <MiniTile icon={<ListTodo className="h-5 w-5" />} label="النواقص" n={shortages} color="purple" onClick={() => open('shortages')} />
      </div>

      {/* مين باع كام */}
      {canSales && (
        <section className="card p-4">
          <div className="mb-2 font-extrabold">مين باع النهارده</div>
          {invoices.error && !invoices.data ? (
            <ErrorBox text={invoices.error} onRetry={invoices.reload} />
          ) : !invoices.data ? (
            <Loading />
          ) : staff.length === 0 ? (
            <div className="py-4 text-center text-sm text-ink-3">لسه محدش باع النهارده</div>
          ) : (
            <div className="space-y-3">
              {staff.map(([name, x]) => (
                <div key={name}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-bold">
                      <UserRound className="h-4 w-4 shrink-0 text-ink-3" />
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 text-xs font-medium text-ink-3">{int(x.count)} فاتورة</span>
                    </span>
                    <Money v={x.total} className="shrink-0 font-extrabold" />
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (x.total / maxStaff) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* آخر العمليات */}
      {canLog && (
        <section className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-extrabold">آخر العمليات</span>
            <button type="button" onClick={() => open('log')} className="flex items-center gap-0.5 text-sm font-bold text-primary">
              السجل كله <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          {feed.error && !feed.data ? (
            <ErrorBox text={feed.error} onRetry={feed.reload} />
          ) : !feed.data ? (
            <Loading />
          ) : feed.data.length === 0 ? (
            <Empty text="مفيش عمليات النهارده لسه" />
          ) : (
            <div className="divide-y divide-line-soft">
              {feed.data.map((e) => {
                const st = actionStyle(e.action)
                const I = st.icon
                return (
                  <div key={e.id} className={cx('flex items-center gap-3 py-2.5', e.status === 'undone' && 'opacity-50')}>
                    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-btn', iconBg[st.color])}>
                      <I className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold">{e.title}</div>
                      <div className="truncate text-xs text-ink-3">{e.description.split('\n')[1] ?? e.description.split('\n')[0]}</div>
                    </div>
                    <div className="shrink-0 text-left text-xs">
                      <div className="font-bold text-primary">{e.user_name ?? ''}</div>
                      <div className="text-ink-3">{ago(e.created_at, now)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

const tileColor = {
  green: 'text-green',
  red: 'text-red',
  primary: 'text-primary',
  teal: 'text-teal',
  orange: 'text-orange',
  purple: 'text-purple',
} as const

function Tile({ icon, label, value, sub, color, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color: keyof typeof tileColor; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card min-w-0 p-4 text-right active:scale-[0.98]">
      <div className="flex items-center gap-1.5 text-sm font-bold text-ink-3">
        <span className={tileColor[color]}>{icon}</span>
        {label}
      </div>
      <div className={cx('mt-1 truncate text-2xl font-extrabold', tileColor[color])}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-3">{sub}</div>}
    </button>
  )
}

function MiniTile({ icon, label, n, color, onClick }: { icon: React.ReactNode; label: string; n: number; color: keyof typeof tileColor; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card flex min-w-0 flex-col items-center gap-1 p-3 active:scale-[0.98]">
      <span className={cx(n > 0 ? tileColor[color] : 'text-ink-3')}>{icon}</span>
      <span className={cx('num text-xl font-extrabold', n > 0 ? tileColor[color] : 'text-ink-3')}>{int(n)}</span>
      <span className="text-xs font-bold text-ink-3">{label}</span>
    </button>
  )
}
