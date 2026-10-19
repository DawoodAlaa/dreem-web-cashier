import { ArrowRight, Banknote, Pencil, Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CustomerForm, useCustomers } from '@/components/CustomerPicker'
import { PayModal } from '@/components/PayModal'
import { Button, Empty, ErrorBox, IconButton, KV, Loading, Money, PageHeader, SearchBox, Stat, StatGrid, Tag, cx, type Color } from '@/components/ui'
import { VirtualList } from '@/components/virtual'
import { nums, q as one, rpc } from '@/lib/api'
import { useCan } from '@/lib/auth'
import { EPS, dateFmt, dateTimeFmt, int, norm } from '@/lib/format'
import { go, setArg, useNav } from '@/lib/nav'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerTxn } from '@/lib/types'
import { useLive } from '@/lib/useLive'

const KINDS: Record<string, { label: string; color: Color }> = {
  credit_sale: { label: 'آجل فاتورة', color: 'orange' },
  payment: { label: 'تحصيل', color: 'teal' },
  return_offset: { label: 'خصم مرتجع', color: 'red' },
  adjust: { label: 'تسوية', color: 'primary' },
  opening: { label: 'رصيد سابق', color: 'purple' },
}

export default function CustomersPage() {
  const live = useCustomers()
  const arg = useNav((s) => s.arg)
  const canEdit = useCan('customers') || useCan('credit')
  const [q, setQ] = useState('')
  const [debtOnly, setDebtOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const all = live.data ?? []
  const list = useMemo(() => {
    const n = norm(q)
    return all.filter((c) => (!debtOnly || c.balance > EPS) && (!n || norm(c.name).includes(n) || (c.phone ?? '').includes(q.trim())))
  }, [all, q, debtOnly])
  const totalDebt = all.reduce((s, c) => s + Math.max(0, c.balance), 0)
  const debtors = all.filter((c) => c.balance > EPS).length

  const openId = arg ? Number(arg) : null
  if (openId) {
    const c = all.find((x) => x.id === openId)
    if (!c) return live.loading ? <Loading /> : <Empty text="العميل مش موجود" />
    return <CustomerPage c={c} onBack={() => setArg(null)} />
  }

  return (
    <div>
      <PageHeader
        title="العملاء والآجل"
        actions={
          canEdit && (
            <Button icon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)}>
              عميل جديد
            </Button>
          )
        }
      />
      <StatGrid cols={3}>
        <Stat label="إجمالي الآجل" value={<Money v={totalDebt} />} color="orange" />
        <Stat label="عليهم آجل" value={int(debtors)} color="red" sub="عميل" />
        <Stat label="كل العملاء" value={int(all.length)} color="primary" />
      </StatGrid>
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="بحث بالاسم أو التليفون" className="min-w-[200px] flex-1" />
        <button type="button" className={cx('chip', debtOnly && 'chip-on')} onClick={() => setDebtOnly((x) => !x)}>
          عليهم آجل بس
        </button>
      </div>
      {live.error && !live.data ? (
        <ErrorBox text={live.error} onRetry={live.reload} />
      ) : live.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon={<Users />} text={all.length ? 'مفيش عملاء مطابقين' : 'مفيش عملاء لسه'} />
      ) : (
        <VirtualList
          items={list}
          estimate={64}
          getKey={(c) => c.id}
          render={(c) => (
            <button type="button" onClick={() => setArg(String(c.id))} className="card flex w-full items-center gap-3 p-3 text-right hover:border-primary/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light font-extrabold text-primary">{c.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{c.name}</div>
                <div className="truncate text-xs text-ink-3">
                  {c.phone && <span dir="ltr">{c.phone}</span>}
                  {c.last_move && ` • آخر حركة ${dateFmt(c.last_move)}`}
                </div>
              </div>
              {c.balance > EPS ? (
                <span className="shrink-0 text-left">
                  <span className="block text-[11px] text-ink-3">عليه</span>
                  <Money v={c.balance} className="font-extrabold text-orange" />
                </span>
              ) : (
                <Tag color="green">خالص</Tag>
              )}
            </button>
          )}
        />
      )}
      {adding && <CustomerForm open onClose={() => setAdding(false)} />}
    </div>
  )
}

function CustomerPage({ c, onBack }: { c: Customer; onBack: () => void }) {
  const canCollect = useCan('customers')
  const canEdit = useCan('customers') || useCan('credit')
  const [paying, setPaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const txns = useLive(`ctx:${c.id}`, ['customer_txns'], async () => {
    const rows = (await one(supabase.from('customer_txns').select().eq('customer_id', c.id).order('id', { ascending: false }))) as CustomerTxn[]
    return rows.map((r) => nums(r, ['amount']))
  })
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <IconButton label="رجوع" onClick={onBack}>
          <ArrowRight className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-extrabold">{c.name}</div>
          {c.phone && (
            <a href={`tel:${c.phone}`} className="text-sm text-primary" dir="ltr">
              {c.phone}
            </a>
          )}
        </div>
      </div>
      <div className={cx('card mb-3 p-5 text-center', c.balance > EPS ? 'bg-orange-light' : 'bg-green-light')}>
        <div className={cx('text-sm font-bold', c.balance > EPS ? 'text-orange' : 'text-green')}>{c.balance > EPS ? 'عليه آجل' : c.balance < -EPS ? 'ليه رصيد' : 'حسابه خالص'}</div>
        <Money v={Math.abs(c.balance)} className={cx('text-4xl font-extrabold', c.balance > EPS ? 'text-orange' : 'text-green')} />
      </div>
      {c.notes && (
        <div className="card mb-3 p-3">
          <KV k="ملاحظات" v={c.notes} />
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {canCollect && (
          <Button variant="green" icon={<Banknote className="h-5 w-5" />} disabled={c.balance <= EPS} onClick={() => setPaying(true)}>
            تحصيل
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" icon={<Pencil className="h-5 w-5" />} onClick={() => setEditing(true)}>
            تعديل البيانات
          </Button>
        )}
      </div>
      <div className="mb-2 font-extrabold">الحركات</div>
      {txns.loading ? (
        <Loading />
      ) : !txns.data?.length ? (
        <Empty text="مفيش حركات" />
      ) : (
        <div className="card divide-y divide-line-soft">
          {txns.data.map((t) => (
            <div key={t.id} className={cx('flex items-center justify-between gap-3 px-3 py-2.5', t.voided && 'opacity-50')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag color={KINDS[t.kind]?.color ?? 'gray'}>{KINDS[t.kind]?.label ?? t.kind}</Tag>
                  {t.voided && <Tag>تم التراجع</Tag>}
                  {t.invoice_id && (
                    <button type="button" className="text-xs font-bold text-primary" onClick={() => go('invoices', String(t.invoice_id))}>
                      عرض الفاتورة
                    </button>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">
                  {dateTimeFmt(t.created_at)}
                  {t.note ? ` • ${t.note}` : ''}
                </div>
              </div>
              <span className={cx('shrink-0 font-extrabold', t.amount > 0 ? 'text-orange' : 'text-teal')}>
                {t.amount > 0 ? '+' : '−'}
                <Money v={Math.abs(t.amount)} />
              </span>
            </div>
          ))}
        </div>
      )}
      {paying && (
        <PayModal
          title={`تحصيل من ${c.name}`}
          max={c.balance}
          onClose={() => setPaying(false)}
          onPay={(a, n) => rpc('customer_payment', { p_id: c.id, p_amount: a, p_note: n })}
          success="تم التحصيل"
          hint="المبلغ هيدخل الدرج"
        />
      )}
      {editing && <CustomerForm open customer={c} onClose={() => setEditing(false)} />}
    </div>
  )
}
