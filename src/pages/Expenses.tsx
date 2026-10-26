import { AlertTriangle, Plus, Trash2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LossForm } from '@/components/LossForm'
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, Money, NumInput, PageHeader, RangeFilter, SearchBox, Segmented, Select, Stat, StatGrid, Tag, TextArea, confirmDialog } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { fetchAll, nums, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { dateFmt, dateTimeFmt, fromYmd, int, iso, makeRange, money, norm, parseNum, ymd, type DateRange } from '@/lib/format'
import { expenseCategories, useShop } from '@/lib/shop'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/toast'
import type { Expense, Loss } from '@/lib/types'
import { useLive } from '@/lib/useLive'

export default function ExpensesPage() {
  const canExpenses = useCan('expenses')
  const canStock = useCan('stock')
  const showCost = useCan('reports')
  const canUndo = useCan('undo')
  const [range, setRange] = useState<DateRange>(() => makeRange('month'))
  const [tab, setTab] = useState<'expenses' | 'losses'>('expenses')
  const [q, setQ] = useState('')
  const [addExp, setAddExp] = useState(false)
  const [addLoss, setAddLoss] = useState(false)
  const key = `${iso(range.from)}:${iso(range.to)}`
  const expenses = useLive(`exp:${key}`, ['expenses'], async () => {
    const rows = await fetchAll<Expense>(() =>
      supabase.from('expenses').select().eq('voided', false).gte('date', iso(range.from)).lt('date', iso(range.to)).order('date', { ascending: false }),
    )
    return rows.map((r) => nums(r, ['amount']))
  })
  const losses = useLive(`loss:${key}`, ['losses'], async () => {
    const rows = await fetchAll<Loss>(() =>
      supabase.from('losses').select().eq('voided', false).gte('created_at', iso(range.from)).lt('created_at', iso(range.to)).order('id', { ascending: false }),
    )
    return rows.map((r) => nums(r, ['qty', 'unit_cost']))
  })
  const expTotal = (expenses.data ?? []).reduce((s, e) => s + e.amount, 0)
  const lossTotal = (losses.data ?? []).reduce((s, l) => s + l.qty * l.unit_cost, 0)
  const lossQty = (losses.data ?? []).reduce((s, l) => s + l.qty, 0)

  const n = norm(q)
  const expList = useMemo(() => (expenses.data ?? []).filter((e) => !n || norm(`${e.title} ${e.category} ${e.note ?? ''}`).includes(n)), [expenses.data, n])
  const lossList = useMemo(() => (losses.data ?? []).filter((l) => !n || norm(`${l.product_name} ${l.reason} ${l.note ?? ''}`).includes(n)), [losses.data, n])
  const cur = tab === 'expenses' ? expenses : losses

  // المسح = تراجع عن العملية: المصروف بيرجّع فلوسه للدرج، والعملية بتفضل في السجل متعلّم عليها "تم التراجع"
  const delExpense = async (e: Expense) => {
    const salary = e.category === 'رواتب' && e.note === 'من صندوق المرتبات'
    const ok = await confirmDialog({
      title: 'مسح المصروف',
      message: salary
        ? `هيتمسح "${e.title}" (${money(e.amount)} ج.م) وسحب المرتب بتاعه، والفلوس هترجع درج المرتبات.`
        : `هيتمسح "${e.title}" (${money(e.amount)} ج.م) والفلوس هترجع الدرج.`,
      ok: 'مسح',
      danger: true,
    })
    if (ok) await run(() => rpc('undo', { p_op: e.op_id }), 'تم مسح المصروف')
  }
  const delLoss = async (l: Loss) => {
    const ok = await confirmDialog({ title: 'مسح الهالك', message: `هيتمسح هالك "${l.product_name}" × ${l.qty}.`, ok: 'مسح', danger: true })
    if (ok) await run(() => rpc('undo', { p_op: l.op_id }), 'تم مسح الهالك')
  }

  return (
    <div>
      <PageHeader
        title="المصاريف والهوالك"
        actions={
          <>
            {canExpenses && (
              <Button icon={<Plus className="h-5 w-5" />} onClick={() => setAddExp(true)}>
                مصروف
              </Button>
            )}
            {canStock && (
              <Button variant="danger-soft" icon={<AlertTriangle className="h-5 w-5" />} onClick={() => setAddLoss(true)}>
                هالك
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3">
        <RangeFilter value={range} onChange={setRange} />
      </div>
      <StatGrid cols={3}>
        <Stat label="إجمالي المصاريف" value={<Money v={expTotal} />} color="red" sub={`${expList.length} مصروف`} />
        <Stat label="الهوالك" value={showCost ? <Money v={lossTotal} /> : `${int(lossQty)} قطعة`} color="orange" sub={showCost ? 'بسعر الجملة' : undefined} />
        <Stat label="الإجمالي" value={showCost ? <Money v={expTotal + lossTotal} /> : <Money v={expTotal} />} />
      </StatGrid>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-full sm:w-72">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: 'المصاريف' },
              { value: 'losses', label: 'الهوالك' },
            ]}
          />
        </div>
        <SearchBox value={q} onChange={setQ} className="min-w-[200px] flex-1" />
      </div>
      {cur.error && !cur.data ? (
        <ErrorBox text={cur.error} onRetry={cur.reload} />
      ) : cur.loading ? (
        <Loading />
      ) : tab === 'expenses' ? (
        expList.length === 0 ? (
          <Empty icon={<Wallet />} text="مفيش مصاريف في الفترة دي" />
        ) : (
          <VirtualList
            items={expList}
            estimate={64}
            getKey={(e) => e.id}
            render={(e) => (
              <div className="card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{e.title}</span>
                    <Tag color="primary">{e.category}</Tag>
                  </div>
                  <div className="truncate text-xs text-ink-3">
                    {dateFmt(e.date)}
                    {e.note ? ` • ${e.note}` : ''}
                  </div>
                </div>
                <Money v={e.amount} className="shrink-0 font-extrabold text-red" />
                {canUndo && (
                  <button type="button" aria-label="مسح المصروف" className="icon-btn -ml-1 shrink-0 text-ink-3 hover:text-red" onClick={() => delExpense(e)}>
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
          />
        )
      ) : lossList.length === 0 ? (
        <Empty icon={<AlertTriangle />} text="مفيش هوالك في الفترة دي" />
      ) : (
        <VirtualList
          items={lossList}
          estimate={64}
          getKey={(l) => l.id}
          render={(l) => (
            <div className="card flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{l.product_name}</span>
                  <span className="text-sm text-ink-3">× {l.qty}</span>
                  <Tag color="orange">{l.reason}</Tag>
                  {l.source !== 'manual' && <Tag color="red">{l.source === 'return' ? 'من مرتجع' : 'من استبدال'}</Tag>}
                </div>
                <div className="truncate text-xs text-ink-3">
                  {dateTimeFmt(l.created_at)}
                  {l.note ? ` • ${l.note}` : ''}
                </div>
              </div>
              {showCost && <Money v={l.qty * l.unit_cost} className="shrink-0 font-extrabold text-orange" />}
              {/* الهالك اللي جاي من مرتجع أو استبدال بيتمسح مع المرتجع نفسه من الفاتورة */}
              {canUndo && l.source === 'manual' && (
                <button type="button" aria-label="مسح الهالك" className="icon-btn -ml-1 shrink-0 text-ink-3 hover:text-red" onClick={() => delLoss(l)}>
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        />
      )}
      {addExp && <ExpenseForm onClose={() => setAddExp(false)} />}
      {addLoss && <LossForm open onClose={() => setAddLoss(false)} />}
    </div>
  )
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const settings = useShop((s) => s.settings)
  const cats = expenseCategories(settings)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(cats[0] ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(ymd(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    // لو التاريخ النهارده نسجل الوقت الحالي، غير كده الساعة 12 الضهر في اليوم ده
    const d = date === ymd(new Date()) ? new Date() : new Date(fromYmd(date).getTime() + 12 * 3600 * 1000)
    const ok = await run(
      () => rpc('add_expense', { p_title: title.trim(), p_category: category, p_amount: parseNum(amount), p_date: d.toISOString(), p_note: note.trim() || null }),
      'تم تسجيل المصروف',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="مصروف جديد"
      footer={
        <Button block loading={busy} disabled={!title.trim() || !parseNum(amount)} onClick={save}>
          تسجيل المصروف
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="البيان">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: فاتورة الكهرباء" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفئة">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="المبلغ">
            <NumInput value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label="التاريخ">
          <Input type="date" value={date} max={ymd(new Date())} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="rounded-btn bg-orange-light px-3 py-2 text-xs font-bold text-orange">المصروف بيتخصم من فلوس الدرج</div>
      </div>
    </Modal>
  )
}
