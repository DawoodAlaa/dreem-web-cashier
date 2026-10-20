import { ArrowDownToLine, HandCoins, Pencil, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, Select, Stat, StatGrid, Tag, cx } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { fetchAll, nums, q as one, rpc } from '@/lib/api'
import { useAuth, useCan } from '@/lib/auth'
import { EPS, dateTimeFmt, iso, makeRange, money, parseNum, type DateRange } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { Profile } from '@/lib/types'
import { useShop } from '@/lib/shop'
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

// المرتب اليومي: إعداد للمحل كله (app_settings.salary_daily)، الافتراضي 500
export function useSalaryDaily() {
  const v = useShop((s) => s.settings.salary_daily)
  const n = parseNum(v ?? '')
  return n != null && n > 0 ? n : 500
}

export function useSalaryBalance() {
  return useLive('salary_balance', ['salary_moves'], async () => Number(await rpc('salary_balance')))
}

export default function SalariesPage() {
  const me = useAuth((s) => s.profile)
  const canManage = useCan('salaries')
  const canSettings = useCan('settings')
  const daily = useSalaryDaily()
  const [range, setRange] = useState<DateRange>(() => makeRange('month'))
  const [dlg, setDlg] = useState<'in' | 'out' | 'daily' | null>(null)
  const [who, setWho] = useState<string | null>(null)
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
  // سحب كل واحد في الفترة: المجموع وعدد المرات وآخر مرة
  const byPerson = useMemo(() => {
    const m = new Map<string, { sum: number; count: number; last: string }>()
    for (const x of active) {
      if (x.kind !== 'out') continue
      const k = x.person_name ?? '-'
      const r = m.get(k) ?? { sum: 0, count: 0, last: x.created_at }
      r.sum += x.amount
      r.count++
      if (x.created_at > r.last) r.last = x.created_at
      m.set(k, r)
    }
    return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum)
  }, [active])
  const shown = who == null ? visible : visible.filter((m) => m.kind === 'out' && (m.person_name ?? '-') === who)

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">
              المرتب اليومي: <b className="num">{money(daily)}</b> ج.م
            </span>
            {canSettings && (
              <Button size="sm" variant="soft" icon={<Pencil className="h-4 w-4" />} onClick={() => setDlg('daily')}>
                تغيير
              </Button>
            )}
            {todayIn.data <= EPS && (
              <Button size="sm" onClick={() => setDlg('in')}>
                حوّل {money(daily)} ج.م
              </Button>
            )}
          </div>
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

      {canManage && (
        <div className="card mb-4 p-4">
          <div className="mb-1 font-extrabold">كل واحد سحب كام</div>
          <div className="mb-2 text-xs text-ink-3">في الفترة اللي فوق. دوس على اسم عشان تشوف سحباته بس.</div>
          {byPerson.length === 0 ? (
            <div className="py-3 text-center text-sm text-ink-3">محدش سحب في الفترة دي</div>
          ) : (
            <div className="divide-y divide-line-soft">
              {byPerson.map(([name, r]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setWho(who === name ? null : name)}
                  className={cx('flex w-full items-center justify-between gap-2 rounded-btn px-2 py-2 text-start transition-colors hover:bg-bg', who === name && 'bg-primary-light')}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-bold">
                      <UserRound className="h-4 w-4 shrink-0 text-ink-3" />
                      {name}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {r.count === 1 ? 'مرة واحدة' : r.count === 2 ? 'مرتين' : `${r.count} ${r.count <= 10 ? 'مرات' : 'مرة'}`} • آخر سحب {dateTimeFmt(r.last)}
                    </span>
                  </span>
                  <Money v={r.sum} className="shrink-0 font-extrabold text-red" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <span className="font-extrabold">{who == null ? 'الحركات' : `سحبات ${who}`}</span>
        {who != null && (
          <button type="button" className="chip chip-on flex items-center gap-1" onClick={() => setWho(null)}>
            <X className="h-3.5 w-3.5" />
            الكل
          </button>
        )}
      </div>
      {moves.error && !moves.data ? (
        <ErrorBox text={moves.error} onRetry={moves.reload} />
      ) : moves.loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty icon={<HandCoins />} text="مفيش حركات في الفترة دي" />
      ) : (
        <VirtualList
          items={shown}
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

      {dlg === 'in' && <TransferForm daily={daily} onClose={() => setDlg(null)} />}
      {dlg === 'daily' && <DailyForm daily={daily} onClose={() => setDlg(null)} />}
      {dlg === 'out' && <WithdrawForm balance={balance.data ?? 0} canManage={canManage} onClose={() => setDlg(null)} />}
    </div>
  )
}

function DailyForm({ daily, onClose }: { daily: number; onClose: () => void }) {
  const [amount, setAmount] = useState(String(daily))
  const [busy, setBusy] = useState(false)
  const n = parseNum(amount) ?? 0
  const save = async () => {
    setBusy(true)
    const ok = await run(
      () => rpc('save_settings', { p_values: { salary_daily: String(n) }, p_description: `المرتب اليومي بقى ${money(n)} ج.م` }),
      'تم حفظ المرتب اليومي',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="المرتب اليومي"
      footer={
        <Button block loading={busy} disabled={n <= 0} onClick={save}>
          حفظ
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (n > 0 && !busy) save()
        }}
      >
        <Field label="المبلغ اللي بيتحوّل كل يوم" hint="ده اللي بيظهر في زرار التحويل السريع. وقت التحويل تقدر تكتب أي مبلغ تاني">
          <NumInput autoFocus className="text-xl font-extrabold" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <button type="submit" className="sr-only" />
      </form>
    </Modal>
  )
}

function TransferForm({ daily, onClose }: { daily: number; onClose: () => void }) {
  const drawer = useCashBalance()
  const [amount, setAmount] = useState(String(daily))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = parseNum(amount) ?? 0
  const err = n <= 0 ? 'اكتب المبلغ' : drawer.data != null && n > drawer.data + EPS ? `المبلغ في الدرج (${money(drawer.data)}) أقل من كده` : null
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('salary_fund_add', { p_amount: n, p_note: note.trim() || null }), `تم تحويل ${money(n)} ج.م للمرتبات`)
    setBusy(false)
    if (ok) onClose()
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
