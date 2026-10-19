import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable, ErrorBox, Loading, Money, PageHeader, RangeFilter, Segmented, Stat, StatGrid, Tag, cx } from '@/components/ui'
import { rpc } from '@/lib/api'
import { dateFmt, fromYmd, int, iso, makeRange, money, num, type DateRange } from '@/lib/format'
import type { ProfitReport } from '@/lib/types'
import { useLive } from '@/lib/useLive'

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>(() => makeRange('month'))
  const [sort, setSort] = useState<'profit' | 'qty'>('profit')
  const live = useLive(`profit:${iso(range.from)}:${iso(range.to)}`, ['invoices', 'adjustments', 'expenses', 'losses'], async () => {
    const r = await rpc<ProfitReport>('profit_report', { p_from: iso(range.from), p_to: iso(range.to) })
    return {
      ...r,
      revenue: num(r.revenue),
      cost: num(r.cost),
      discounts: num(r.discounts),
      returns_value: num(r.returns_value),
      expenses: num(r.expenses),
      losses: num(r.losses),
      invoices: num(r.invoices),
      items_sold: num(r.items_sold),
      products: (r.products ?? []).map((p) => ({ name: p.name, qty: num(p.qty), revenue: num(p.revenue), cost: num(p.cost) })),
      days: (r.days ?? []).map((d) => ({ day: d.day, revenue: num(d.revenue), cost: num(d.cost), invoices: num(d.invoices), expenses: num(d.expenses), losses: num(d.losses) })),
      expenses_by_category: Object.fromEntries(Object.entries(r.expenses_by_category ?? {}).map(([k, v]) => [k, num(v)])),
    } as ProfitReport
  })
  const r = live.data
  const products = useMemo(() => {
    if (!r) return []
    const list = r.products.map((p) => ({ ...p, profit: p.revenue - p.cost }))
    return list.sort((a, b) => (sort === 'profit' ? b.profit - a.profit : b.qty - a.qty)).slice(0, 30)
  }, [r, sort])

  if (live.error && !r) return <ErrorBox text={live.error} onRetry={live.reload} />

  const gross = r ? r.revenue - r.cost : 0
  const net = r ? gross - r.expenses - r.losses : 0
  const margin = r && r.revenue > 0 ? (gross / r.revenue) * 100 : 0
  const maxVal = products.reduce((m, p) => Math.max(m, sort === 'profit' ? p.profit : p.qty), 0) || 1

  return (
    <div>
      <PageHeader title="تقرير الأرباح" />
      <div className="mb-3">
        <RangeFilter value={range} onChange={setRange} />
      </div>
      {!r ? (
        <Loading />
      ) : (
        <>
          <StatGrid cols={5}>
            <Stat label="صافي المبيعات" value={<Money v={r.revenue} />} color="primary" sub={`${int(r.invoices)} فاتورة • ${int(r.items_sold)} قطعة`} />
            <Stat label="تكلفة البضاعة" value={<Money v={r.cost} />} />
            <Stat label="مكسب البيع" value={<Money v={gross} />} color="green" sub={`هامش ${margin.toFixed(1)}%`} />
            <Stat label="المصاريف" value={<Money v={r.expenses} />} color="red" />
            <Stat label="الهوالك" value={<Money v={r.losses} />} color="orange" />
          </StatGrid>

          <div className={cx('card mb-4 flex items-center justify-between gap-4 p-5', net >= 0 ? 'border-green/30 bg-green-light' : 'border-red/30 bg-red-light')}>
            <div>
              <div className={cx('flex items-center gap-2 font-bold', net >= 0 ? 'text-green' : 'text-red')}>
                {net >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                صافي الربح {net < 0 && '(خسارة)'}
              </div>
              <div className="mt-1 text-xs text-ink-3">مكسب البيع − المصاريف − الهوالك</div>
            </div>
            <Money v={net} className={cx('text-3xl font-extrabold lg:text-4xl', net >= 0 ? 'text-green' : 'text-red')} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Tag color="orange" className="py-1 text-sm">
              الخصومات {money(r.discounts)}
            </Tag>
            <Tag color="red" className="py-1 text-sm">
              قيمة المرتجعات {money(r.returns_value)}
            </Tag>
            {Object.entries(r.expenses_by_category).map(([k, v]) => (
              <Tag key={k} color="gray" className="py-1 text-sm">
                {k}: {money(v)}
              </Tag>
            ))}
          </div>

          <div className="lg:grid lg:grid-cols-2 lg:gap-4">
            <div className="card mb-4 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-extrabold">أكتر المنتجات</div>
                <div className="w-48">
                  <Segmented
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: 'profit', label: 'بالمكسب' },
                      { value: 'qty', label: 'بالكمية' },
                    ]}
                  />
                </div>
              </div>
              {products.length === 0 ? (
                <div className="py-6 text-center text-ink-3">مفيش مبيعات في الفترة دي</div>
              ) : (
                <div className="space-y-2.5">
                  {products.map((p, i) => {
                    const v = sort === 'profit' ? p.profit : p.qty
                    return (
                      <div key={p.name}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-bold">
                            <span className="ml-1 text-ink-3">{i + 1}.</span>
                            {p.name}
                          </span>
                          <span className="shrink-0 text-xs text-ink-3">
                            {p.qty} قطعة • <span className="font-bold text-green">{money(p.profit)}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (Math.max(0, v) / maxVal) * 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="mb-4">
              <div className="mb-2 font-extrabold">الأيام</div>
              <DataTable
                rows={[...r.days].sort((a, b) => b.day.localeCompare(a.day))}
                rowKey={(d) => d.day}
                empty="مفيش بيانات في الفترة دي"
                cols={[
                  { label: 'اليوم', render: (d) => dateFmt(fromYmd(d.day)) },
                  { label: 'الفواتير', render: (d) => d.invoices },
                  { label: 'المبيعات', render: (d) => money(d.revenue) },
                  { label: 'المكسب', render: (d) => <span className="text-green">{money(d.revenue - d.cost)}</span> },
                  { label: 'المصاريف', render: (d) => money(d.expenses), empty: (d) => !d.expenses },
                  { label: 'الهوالك', render: (d) => money(d.losses), empty: (d) => !d.losses },
                  {
                    label: 'الصافي',
                    render: (d) => {
                      const n = d.revenue - d.cost - d.expenses - d.losses
                      return <span className={cx('font-extrabold', n >= 0 ? 'text-green' : 'text-red')}>{money(n)}</span>
                    },
                  },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
