import { ArrowDownToLine, HandCoins, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, Select, Stat, StatGrid, Tag, cx } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { fetchAll, nums, q as one, rpc } from '@/lib/api'
import { useAuth, useCan } from '@/lib/auth'
import { EPS, dateTimeFmt, iso, makeRange, money, parseNum, type DateRange } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { Profile } from '@/lib/types'
import { useLive } from '@/lib/useLive'
import { useCashBalance } from './Drawer'

// المرتبات: درج تاني. بيتحوّل له مبلغ من الدرج (زي 500 كل يوم) وكل واحد بيسحب منه.

interface SalaryMove {
  id: number
  kind: 'in' | 'out'
  amount: number
  person_id: string | null
  person_name: string | null
  note: string | null
  user_name: string | null
  voided: boolean
  created_at: string
}

const DAILY_KEY = 'cd.salaryDaily'
const lastDaily = () => {
  try {
    return localStorage.getItem(DAILY_KEY) || '500'
  } catch {
    return '500'
  }
}

export function useSalaryBalance() {
  return useLive('salary_balance', ['salary_moves'], async () => Number(await rpc('salary_balance')))
}

export default function SalariesPage() {
  const me = useAuth((s) => s.profile)
  const canManage = useCan('salaries')
  const [range, setRange] = useState<DateRange>(() => makeRange('month'))
  const [dlg, setDlg] = useState<'in' | 'out' | null>(null)
  const balance = useSalaryBalance()
  const today = makeRange('today')
  const todayIn = useLive(`sal_today:${iso(today.from)}`, ['salary_moves'], async () => {
    const rows = (await one(
      supabase.from('salary_moves').select('amount').eq('kind', 'in').eq('voided', false).gte('created_at', iso(today.from)).lt('created_at', iso(today.to)),
    )) as { amount: number }[]
    return rows.reduce((s, r) => s + Number(r.amount), 0)
  })
  const moves = useLive(`sal:${iso(range.from)}:${iso(range.to)}`, ['salary_moves'], async () => {
    const rows = await fetchAll<SalaryMove>(() =>
      supabase.from('salary_moves').select().gte('created_at', iso(range.from)).lt('created_at', iso(range.to)).order('id', { ascending: false }),
    )
    return rows.map((r) => nums(r, ['amount']))
  })

  // اللي معهوش صلاحية المرتبات بيشوف سحبه هو بس
  const visible = useMemo(() => (moves.data ?? []).filter((m) => canManage || (m.kind === 'out' && m.person_id === me?.id)), [moves.data, canManage, me?.id])
  const active = visible.filter((m) => !m.voided)
  const totalIn = active.filter((m) => m.kind === 'in').reduce((s, m) => s + m.amount, 0)
  const totalOut = active.filter((m) => m.kind === 'out').reduce((s, m) => s + m.amount, 0)
  const byPerson = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of active) if (x.kind === 'out') m.set(x.person_name ?? '-', (m.get(x.person_name ?? '-') ?? 0) + x.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [active])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="المرتبات"
        sub="درج تاني للمرتبات: بيتحوّل له من الدرج، وكل واحد بيسحب منه"
        actions={
          <>
            {canManage && (
              <Button icon={<ArrowDownToLine className="h-5 w-5" />} onClick={() => setDlg('in')}>
                تحويل من الدرج
              </Button>
            )}
            <Button variant="soft" icon={<HandCoins className="h-5 w-5" />} onClick={() => setDlg('out')}>
              سحب
            </Button>
          </>
        }
      />

      <div className="card mb-4 bg-gradient-to-br from-teal to-[#0b7a70] p-6 text-center text-white">
        <div className="flex items-center justify-center gap-2 text-sm font-bold text-white/80">
          <HandCoins className="h-5 w-5" />
          رصيد المرتبات دلوقتي
        </div>
        <div className="mt-2 text-5xl font-extrabold">{balance.data == null ? '...' : <Money v={balance.data} />}</div>
      </div>

      {canManage && todayIn.data != null && (
        <div className={cx('mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card border p-3', todayIn.data > EPS ? 'border-green/30 bg-green-light' : 'border-orange/30 bg-orange-light')}>
          <span className={cx('font-bold', todayIn.data > EPS ? 'text-green' : 'text-orange')}>
            {todayIn.data > EPS ? `اتحوّل النهارده ${money(todayIn.data)} ج.م` : 'لسه محوّلتش للمرتبات النهارده'}
          </span>
          {todayIn.data <= EPS && (
            <Button size="sm" onClick={() => setDlg('in')}>
              حوّل {money(parseNum(lastDaily()) ?? 500)} ج.م
            </Button>
          )}
        </div>
      )}

      <div className="mb-3">
        <RangeFilter value={range} onChange={setRange} />
      </div>
      <StatGrid cols={3}>
        {canManage ? <Stat label="اتحوّل من الدرج" value={<Money v={totalIn} />} color="teal" /> : <Stat label="رصيد المرتبات" value={<Money v={balance.data ?? 0} />} color="teal" />}
        <Stat label={canManage ? 'اتسحب' : 'سحبت'} value={<Money v={totalOut} />} color="red" />
        <Stat label="عدد العمليات" value={active.length} />
      </StatGrid>

      {canManage && byPerson.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 font-extrabold">سحب كل واحد في الفترة</div>
          <div className="divide-y divide-line-soft">
            {byPerson.map(([name, sum]) => (
              <div key={name} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 font-bold">
                  <UserRound className="h-4 w-4 text-ink-3" />
                  {name}
                </span>
                <Money v={sum} className="font-extrabold text-red" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 font-extrabold">الحركات</div>
      {moves.error && !moves.data ? (
        <ErrorBox text={moves.error} onRetry={moves.reload} />
      ) : moves.loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty icon={<HandCoins />} text="مفيش حركات في الفترة دي" />
      ) : (
        <VirtualList
          items={visible}
          estimate={68}
          getKey={(m) => m.id}
          render={(m) => (
            <div className={cx('card flex items-center gap-3 p-3', m.voided && 'opacity-50')}>
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-btn', m.kind === 'in' ? 'bg-teal-light text-teal' : 'bg-red-light text-red')}>
                {m.kind === 'in' ? <ArrowDownToLine className="h-5 w-5" /> : <HandCoins className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{m.kind === 'in' ? 'تحويل من الدرج' : `سحب: ${m.person_name ?? '-'}`}</span>
                  {m.voided && <Tag>تم التراجع</Tag>}
                </div>
                <div className="truncate text-xs text-ink-3">
                  {dateTimeFmt(m.created_at)}
                  {m.user_name ? ` • سجّله ${m.user_name}` : ''}
                  {m.note ? ` • ${m.note}` : ''}
                </div>
              </div>
              <span className={cx('shrink-0 font-extrabold', m.kind === 'in' ? 'text-teal' : 'text-red')}>
                {m.kind === 'in' ? '+' : '−'}
                <Money v={m.amount} />
              </span>
            </div>
          )}
        />
      )}

      {dlg === 'in' && <TransferForm onClose={() => setDlg(null)} />}
      {dlg === 'out' && <WithdrawForm balance={balance.data ?? 0} canManage={canManage} onClose={() => setDlg(null)} />}
    </div>
  )
}

function TransferForm({ onClose }: { onClose: () => void }) {
  const drawer = useCashBalance()
  const [amount, setAmount] = useState(lastDaily)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = parseNum(amount) ?? 0
  const err = n <= 0 ? 'اكتب المبلغ' : drawer.data != null && n > drawer.data + EPS ? `المبلغ في الدرج (${money(drawer.data)}) أقل من كده` : null
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('salary_fund_add', { p_amount: n, p_note: note.trim() || null }), `تم تحويل ${money(n)} ج.م للمرتبات`)
    setBusy(false)
    if (ok) {
      try {
        localStorage.setItem(DAILY_KEY, String(n))
      } catch {
        /* ignore */
      }
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="تحويل من الدرج للمرتبات"
      footer={
        <Button block loading={busy} disabled={!!err} onClick={save}>
          تحويل
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-ink-3">
          في الدرج دلوقتي: <b className="text-ink">{drawer.data == null ? '...' : `${money(drawer.data)} ج.م`}</b>
        </div>
        <Field label="المبلغ" error={amount && err ? err : null} hint="الفلوس دي هتخرج من الدرج وتتحط في درج المرتبات">
          <NumInput autoFocus className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[300, 500, 1000, 1500].map((x) => (
            <button key={x} type="button" className={cx('chip', n === x && 'chip-on')} onClick={() => setAmount(String(x))}>
              {money(x)}
            </button>
          ))}
        </div>
        <Field label="ملاحظات">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: يومية الأحد" />
        </Field>
      </div>
    </Modal>
  )
}

const OTHER = '__other'

function WithdrawForm({ balance, canManage, onClose }: { balance: number; canManage: boolean; onClose: () => void }) {
  const me = useAuth((s) => s.profile)
  const members = useLive(canManage ? 'members' : null, ['profiles'], async () => (await one(supabase.from('profiles').select().eq('shop_id', me!.shop_id).order('created_at'))) as Profile[])
  const [person, setPerson] = useState<string>(me?.id ?? '')
  const [otherName, setOtherName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = parseNum(amount) ?? 0
  let err: string | null = null
  if (n <= 0) err = 'اكتب المبلغ'
  else if (n > balance + EPS) err = `رصيد المرتبات (${money(balance)}) أقل من كده`
  else if (person === OTHER && !otherName.trim()) err = 'اكتب الاسم'
  const save = async () => {
    setBusy(true)
    const self = person === me?.id
    const ok = await run(
      () =>
        rpc('salary_withdraw', {
          p_person: self || person === OTHER ? null : person,
          p_person_name: person === OTHER ? otherName.trim() : null,
          p_amount: n,
          p_note: note.trim() || null,
        }),
      `تم تسجيل سحب ${money(n)} ج.م`,
    )
    setBusy(false)
    if (ok) onClose()
  }
  const list = (members.data ?? []).filter((m) => m.active)
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="سحب من المرتبات"
      footer={
        <Button block loading={busy} disabled={!!err} onClick={save}>
          تسجيل السحب
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-ink-3">
          رصيد المرتبات: <b className="text-ink">{money(balance)} ج.م</b>
        </div>
        {canManage ? (
          <Field label="مين اللي سحب">
            <Select value={person} onChange={(e) => setPerson(e.target.value)}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === me?.id ? ' (أنا)' : ''}
                </option>
              ))}
              {!list.some((m) => m.id === me?.id) && me && <option value={me.id}>{me.name} (أنا)</option>}
              <option value={OTHER}>حد تاني (مش مستخدم في البرنامج)</option>
            </Select>
          </Field>
        ) : (
          <div className="rounded-btn bg-bg px-3 py-2 text-sm">
            السحب هيتسجل باسمك: <b>{me?.name}</b>
          </div>
        )}
        {person === OTHER && (
          <Field label="الاسم">
            <Input autoFocus value={otherName} onChange={(e) => setOtherName(e.target.value)} />
          </Field>
        )}
        <Field label="المبلغ" error={amount && err && err !== 'اكتب الاسم' ? err : null}>
          <NumInput autoFocus={person !== OTHER} className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: سلفة، أو مرتب الأسبوع" />
        </Field>
        <div className="text-xs text-ink-3">السحب بيتسجل مصروف "رواتب" في تقرير الأرباح، ومبيلمسش الدرج الأساسي.</div>
      </div>
    </Modal>
  )
}
