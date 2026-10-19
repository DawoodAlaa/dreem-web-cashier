import { ArrowDownToLine, FileBarChart, Landmark } from 'lucide-react'
import { useState } from 'react'
import { Button, Empty, Field, Input, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, Stat, StatGrid, Tag, cx, type Color } from '@/components/ui'
import { fetchAll, nums, q as one, rpc } from '@/lib/api'
import { EPS, dateTimeFmt, iso, makeRange, money, parseNum, roundMoney, type DateRange } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { CashMove, Settlement } from '@/lib/types'
import { useLive } from '@/lib/useLive'

export const CASH_KINDS: Record<string, { label: string; color: Color }> = {
  sale: { label: 'مبيعات', color: 'green' },
  customer_payment: { label: 'تحصيل آجل', color: 'teal' },
  refund: { label: 'مرتجع', color: 'red' },
  exchange: { label: 'فرق استبدال', color: 'orange' },
  expense: { label: 'مصروف', color: 'red' },
  used_purchase: { label: 'شراء مستعمل', color: 'purple' },
  withdrawal: { label: 'سحب / تصفية', color: 'primary' },
  deposit: { label: 'إيداع', color: 'green' },
  count_diff: { label: 'فرق جرد', color: 'orange' },
  salary_fund: { label: 'تحويل للمرتبات', color: 'teal' },
}

export function useCashBalance() {
  return useLive('cash_balance', ['cash_moves'], async () => Number(await rpc('cash_balance')))
}

export default function DrawerPage() {
  const [range, setRange] = useState<DateRange>(() => makeRange('today'))
  const key = `${iso(range.from)}:${iso(range.to)}`
  const balance = useCashBalance()
  const stats = useLive(`dstats:${key}`, ['cash_moves', 'losses'], async () => {
    const j = await rpc<{ by_kind: Record<string, number>; losses: number; balance: number }>('drawer_stats', { p_from: iso(range.from), p_to: iso(range.to) })
    return Object.fromEntries(Object.entries(j?.by_kind ?? {}).map(([k, v]) => [k, Number(v)])) as Record<string, number>
  })
  const settlements = useLive('settlements', ['settlements'], async () => {
    const rows = (await one(supabase.from('settlements').select().eq('voided', false).order('id', { ascending: false }).limit(100))) as Settlement[]
    return rows.map((r) => nums(r, ['expected_before', 'counted', 'amount']))
  })
  const [depositOpen, setDepositOpen] = useState(false)
  const [movesOpen, setMovesOpen] = useState(false)
  const k = stats.data ?? {}
  const g = (x: string) => k[x] ?? 0

  return (
    <div>
      <PageHeader
        title="تصفية الدرج"
        actions={
          <>
            <Button variant="soft" icon={<ArrowDownToLine className="h-5 w-5" />} onClick={() => setDepositOpen(true)}>
              إيداع / رصيد افتتاحي
            </Button>
            <Button variant="outline" icon={<FileBarChart className="h-5 w-5" />} onClick={() => setMovesOpen(true)}>
              تقرير حركة الدرج
            </Button>
          </>
        }
      />
      <div className="mb-3">
        <RangeFilter value={range} onChange={setRange} />
      </div>
      <StatGrid cols={5}>
        <Stat label="المبيعات النقدي" value={<Money v={g('sale')} />} color="green" />
        <Stat label="تحصيل الآجل" value={<Money v={g('customer_payment')} />} color="teal" />
        <Stat label="المصاريف" value={<Money v={-g('expense')} />} color="red" />
        <Stat label="المرتجعات والمستعمل" value={<Money v={-(g('refund') + g('exchange') + g('used_purchase'))} />} color="purple" sub={g('exchange') > 0 ? `فرق استبدال +${money(g('exchange'))}` : undefined} />
        <Stat label="المسحوبات" value={<Money v={-(g('withdrawal') + g('salary_fund'))} />} color="primary" sub={g('salary_fund') ? `منها للمرتبات ${money(-g('salary_fund'))}` : undefined} />
      </StatGrid>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        <div>
          <div className="card mb-4 bg-gradient-to-br from-primary to-primary-dark p-6 text-center text-white">
            <div className="flex items-center justify-center gap-2 text-sm font-bold text-white/80">
              <Landmark className="h-5 w-5" />
              المبلغ المتوقع في الدرج دلوقتي
            </div>
            <div className="mt-2 text-5xl font-extrabold lg:text-6xl">
              {balance.data == null ? '...' : <Money v={balance.data} />}
            </div>
          </div>
          <SettleForm expected={balance.data ?? 0} />
        </div>
        <div>
          <div className="mb-2 font-extrabold">سجل التصفيات</div>
          {settlements.loading ? (
            <Loading />
          ) : !settlements.data?.length ? (
            <div className="card">
              <Empty text="مفيش تصفيات لسه" />
            </div>
          ) : (
            <div className="card divide-y divide-line-soft">
              {settlements.data.map((s) => {
                const diff = s.counted == null ? 0 : roundMoney(s.counted - s.expected_before)
                return (
                  <div key={s.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        سحب <Money v={s.amount} />
                      </span>
                      <span className="text-xs text-ink-3">{dateTimeFmt(s.created_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Tag color="gray">المتوقع {money(s.expected_before)}</Tag>
                      {s.counted != null && <Tag color="primary">الفعلي {money(s.counted)}</Tag>}
                      {Math.abs(diff) > EPS && <Tag color={diff > 0 ? 'green' : 'red'}>{diff > 0 ? `زيادة ${money(diff)}` : `عجز ${money(-diff)}`}</Tag>}
                      <Tag color="gray">الباقي {money((s.counted ?? s.expected_before) - s.amount)}</Tag>
                    </div>
                    {s.note && <div className="mt-1 text-xs text-ink-3">{s.note}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {depositOpen && <DepositForm onClose={() => setDepositOpen(false)} />}
      {movesOpen && <MovesReport range={range} onClose={() => setMovesOpen(false)} />}
    </div>
  )
}

function SettleForm({ expected }: { expected: number }) {
  const [amount, setAmount] = useState('')
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const a = parseNum(amount) ?? 0
  const c = counted.trim() ? parseNum(counted) : null
  const avail = c ?? expected
  const diff = c == null ? 0 : roundMoney(c - expected)
  let err: string | null = null
  if (a < 0) err = 'المبلغ غلط'
  else if (a > avail + EPS) err = `مبلغ السحب أكبر من الموجود في الدرج (${money(avail)})`
  else if (a === 0 && c == null) err = 'اكتب مبلغ السحب أو المبلغ الفعلي'

  const add = (x: number) => setAmount(String(roundMoney(Math.min(avail, a + x))))
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('settle_drawer', { p_amount: a, p_counted: c, p_note: note.trim() || null }), 'تم تصفية الدرج')
    setBusy(false)
    if (ok) {
      setAmount('')
      setCounted('')
      setNote('')
    }
  }
  return (
    <div className="card mb-4 space-y-3 p-4">
      <div className="text-lg font-extrabold">تصفية الدرج</div>
      <Field label="المبلغ المسحوب">
        <NumInput className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {[500, 1000, 5000, 10000].map((x) => (
          <button key={x} type="button" className="chip" onClick={() => add(x)}>
            +{money(x)}
          </button>
        ))}
        <button type="button" className="chip border-primary text-primary" onClick={() => setAmount(String(roundMoney(Math.max(0, avail))))}>
          الكل
        </button>
      </div>
      <Field label="المبلغ الفعلي في الدرج (اختياري)" hint="لو عدّيت الفلوس، اكتبها هنا والبرنامج هيقولك زيادة ولا عجز ويسجلهم">
        <NumInput value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={money(expected)} />
      </Field>
      {c != null && Math.abs(diff) > EPS && (
        <div className={cx('rounded-btn px-3 py-2 text-sm font-bold', diff > 0 ? 'bg-green-light text-green' : 'bg-red-light text-red')}>
          {diff > 0 ? `زيادة في الدرج ${money(diff)} ج.م` : `عجز في الدرج ${money(-diff)} ج.م`}
        </div>
      )}
      {c != null && Math.abs(diff) <= EPS && <div className="rounded-btn bg-green-light px-3 py-2 text-sm font-bold text-green">الدرج مظبوط</div>}
      <Field label="ملاحظات">
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-3">الرصيد بعد السحب</span>
        <Money v={avail - a} className="font-extrabold" />
      </div>
      <Button block loading={busy} disabled={!!err} onClick={save}>
        تأكيد التصفية
      </Button>
      {err && (amount || counted) && <div className="text-center text-xs font-bold text-red">{err}</div>}
    </div>
  )
}

function DepositForm({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('deposit', { p_amount: parseNum(amount), p_note: note.trim() || null }), 'تم الإيداع')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="إيداع / رصيد افتتاحي"
      footer={
        <Button block loading={busy} disabled={!parseNum(amount)} onClick={save}>
          إيداع
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="المبلغ">
          <NumInput autoFocus className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: فكة أول اليوم" />
        </Field>
      </div>
    </Modal>
  )
}

function MovesReport({ range, onClose }: { range: DateRange; onClose: () => void }) {
  const moves = useLive(`moves:${iso(range.from)}:${iso(range.to)}`, ['cash_moves'], async () => {
    const rows = await fetchAll<CashMove>(() =>
      supabase.from('cash_moves').select().eq('voided', false).gte('created_at', iso(range.from)).lt('created_at', iso(range.to)).order('id', { ascending: false }),
    )
    return rows.map((r) => nums(r, ['amount']))
  })
  const list = moves.data ?? []
  const inSum = list.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0)
  const outSum = list.filter((m) => m.amount < 0).reduce((s, m) => s - m.amount, 0)
  return (
    <Modal open onClose={onClose} size="lg" title="تقرير حركة الدرج">
      <StatGrid cols={3}>
        <Stat label="دخل" value={<Money v={inSum} />} color="green" />
        <Stat label="خرج" value={<Money v={outSum} />} color="red" />
        <Stat label="الصافي" value={<Money v={inSum - outSum} />} color="primary" />
      </StatGrid>
      {moves.loading ? (
        <Loading />
      ) : !list.length ? (
        <Empty text="مفيش حركة في الفترة دي" />
      ) : (
        <div className="divide-y divide-line-soft">
          {list.slice(0, 1000).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Tag color={CASH_KINDS[m.kind]?.color ?? 'gray'}>{CASH_KINDS[m.kind]?.label ?? m.kind}</Tag>
                <div className="mt-0.5 truncate text-xs text-ink-3">
                  {dateTimeFmt(m.created_at)}
                  {m.note ? ` • ${m.note}` : ''}
                </div>
              </div>
              <span className={cx('shrink-0 font-extrabold', m.amount >= 0 ? 'text-green' : 'text-red')}>
                {m.amount >= 0 ? '+' : '−'}
                <Money v={Math.abs(m.amount)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
