import { Check, ClipboardCopy, ListTodo, PackageX, Plus, RotateCcw, Share2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import sqlSetup from '../../supabase/09_shortages.sql?raw'
import { ProductPicker } from '@/components/ProductPicker'
import { Button, Empty, Field, Input, Modal, PageHeader, SearchBox, Segmented, Tag, confirmDialog, cx } from '@/components/ui'
import { isOwner, useAuth } from '@/lib/auth'
import { dateTimeFmt, norm } from '@/lib/format'
import { addShortage, clearDoneShortages, deleteShortage, setShortageDone, useOutOfStock, useShortages, type Shortage } from '@/lib/shortages'
import { useShop, useTrackStock } from '@/lib/shop'
import { run, toast } from '@/lib/toast'
import type { ProductView } from '@/lib/types'

export default function ShortagesPage() {
  const { ready, missing, list } = useShortages()
  const auto = useOutOfStock()
  const byId = useShop((s) => s.byId)
  const owner = isOwner(useAuth((s) => s.profile))
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const [adding, setAdding] = useState(false)

  const open = list.filter((x) => !x.done)
  const done = list.filter((x) => x.done)
  const manualIds = new Set(open.filter((x) => x.product_id).map((x) => x.product_id))
  const autoOnly = auto.filter((a) => !manualIds.has(a.pv.p.id))
  const n = norm(q)
  const match = (s: string) => !n || norm(s).includes(n)

  const shareText = () => {
    const lines = [
      ...open.map((x) => `• ${x.name}${x.low ? ' — قرب يخلص' : ''}${x.note ? ` (${x.note})` : ''}`),
      ...autoOnly.map((a) => `• ${a.pv.p.name}${a.colors.length ? ` — ${a.colors.join('، ')}` : ''}`),
    ]
    return `النواقص (${lines.length}):\n${lines.join('\n')}`
  }
  const share = async () => {
    const text = shareText()
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('تم نسخ القايمة. الزقها في واتساب')
      }
    } catch {
      /* المستخدم قفل المشاركة */
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="النواقص"
        sub="الحاجات اللي خلصت ومحتاجة تتجاب"
        actions={
          <>
            <Button icon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)} disabled={!ready}>
              إضافة
            </Button>
            <Button variant="outline" icon={<Share2 className="h-5 w-5" />} onClick={share} disabled={!open.length && !autoOnly.length}>
              مشاركة القايمة
            </Button>
          </>
        }
      />

      {missing && <SetupBanner owner={owner} />}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-full sm:w-72">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'open', label: `محتاجة تتجاب (${open.length + autoOnly.length})` },
              { value: 'done', label: `اتجابت (${done.length})` },
            ]}
          />
        </div>
        <SearchBox value={q} onChange={setQ} className="min-w-[200px] flex-1" />
      </div>

      {tab === 'open' ? (
        <>
          {open.length + autoOnly.length === 0 && <Empty icon={<ListTodo />} text="مفيش نواقص. كل حاجة موجودة" />}
          {open.filter((x) => match(x.name + ' ' + (x.note ?? ''))).length > 0 && (
            <div className="mb-4">
              <div className="mb-2 font-extrabold">اتضافت للنواقص</div>
              <div className="space-y-2">
                {open
                  .filter((x) => match(x.name + ' ' + (x.note ?? '')))
                  .map((x) => (
                    <ShortageRow key={x.id} s={x} pv={x.product_id ? byId.get(x.product_id) : undefined} />
                  ))}
              </div>
            </div>
          )}
          {autoOnly.filter((a) => match(a.pv.p.name)).length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 font-extrabold">
                خلصت من المخزون <span className="text-xs font-bold text-ink-3">(بتظهر لوحدها لما الكمية توصل صفر)</span>
              </div>
              <div className="space-y-2">
                {autoOnly
                  .filter((a) => match(a.pv.p.name))
                  .map((a) => (
                    <div key={a.pv.p.id} className="card flex items-center gap-3 p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-red-light text-red">
                        <PackageX className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{a.pv.p.name}</div>
                        <div className="flex flex-wrap gap-1 text-xs">
                          {a.colors.length ? a.colors.map((c) => <Tag key={c} color="red">{c} خلص</Tag>) : <Tag color="red">الكمية 0</Tag>}
                          {a.pv.hasVariants && !a.pv.outOfStock && <Tag color="gray">باقي ألوان تانية {a.pv.stock}</Tag>}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {done.length === 0 ? (
            <Empty icon={<Check />} text="مفيش حاجة اتعلّمت إنها اتجابت" />
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={async () => {
                    if (!(await confirmDialog({ title: 'مسح اللي اتجاب', message: `هيتمسح ${done.length} من القايمة`, ok: 'مسح', danger: true }))) return
                    let n = 0
                    if (await run(async () => (n = await clearDoneShortages()))) toast(`تم مسح ${n}`)
                  }}
                >
                  مسح اللي اتجاب
                </Button>
              </div>
              <div className="space-y-2">
                {done
                  .filter((x) => match(x.name))
                  .map((x) => (
                    <ShortageRow key={x.id} s={x} pv={x.product_id ? byId.get(x.product_id) : undefined} />
                  ))}
              </div>
            </>
          )}
        </>
      )}
      {adding && <AddShortage onClose={() => setAdding(false)} />}
    </div>
  )
}

function ShortageRow({ s, pv }: { s: Shortage; pv?: ProductView }) {
  const track = useTrackStock()
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await run(fn)
    setBusy(false)
  }
  return (
    <div className={cx('card flex items-center gap-2 p-3', s.done && 'opacity-70')}>
      <div className="min-w-0 flex-1">
        <div className={cx('font-bold', s.done && 'line-through')}>{s.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {!s.done && <Tag color={s.low ? 'orange' : 'red'}>{s.low ? 'قرب يخلص' : 'خلص'}</Tag>}
          {s.note && <Tag color="gray">{s.note}</Tag>}
          {pv && track && (pv.allUncounted ? <Tag color="gray">لسه متجردش</Tag> : <Tag color={pv.stock <= 0 ? 'red' : 'green'}>الموجود {pv.stock}</Tag>)}
          {!s.product_id && <Tag color="purple">مش في المنتجات</Tag>}
          <span>
            {s.user_name ? `${s.user_name} • ` : ''}
            {dateTimeFmt(s.done && s.done_at ? s.done_at : s.created_at)}
          </span>
        </div>
      </div>
      {/* اتجاب / رجّعها: زرار واضح بكلمة */}
      {s.done ? (
        <Button size="sm" variant="outline" className="h-10 shrink-0 px-3" icon={<RotateCcw className="h-4 w-4" />} disabled={busy} onClick={() => act(() => setShortageDone(s.id, false))}>
          رجّعها
        </Button>
      ) : (
        <Button size="sm" variant="green" className="h-10 shrink-0 px-3" icon={<Check className="h-4 w-4" />} disabled={busy} onClick={() => act(() => setShortageDone(s.id, true))}>
          اتجاب
        </Button>
      )}
      <button
        type="button"
        className="icon-btn text-ink-3 hover:text-red"
        aria-label="حذف"
        disabled={busy}
        onClick={async () => {
          if (await confirmDialog({ title: 'حذف من النواقص', message: `هيتشال "${s.name}" من القايمة`, ok: 'حذف', danger: true })) await act(() => deleteShortage(s.id))
        }}
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  )
}

function AddShortage({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'product' | 'free'>('product')
  const [pv, setPv] = useState<ProductView | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [low, setLow] = useState<'out' | 'low'>('out')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => addShortage(mode === 'product' ? (pv?.p.id ?? null) : null, mode === 'free' ? name : null, note.trim() || null, low === 'low'), 'اتضاف للنواقص')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="إضافة للنواقص"
      footer={
        <Button block loading={busy} disabled={mode === 'product' ? !pv : !name.trim()} onClick={save}>
          إضافة
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'product', label: 'منتج عندنا' },
            { value: 'free', label: 'حاجة مش عندنا' },
          ]}
        />
        {mode === 'product' ? (
          <Field label="المنتج">
            <button type="button" className="input flex items-center text-right" onClick={() => setPicking(true)}>
              {pv ? <span className="truncate">{pv.p.name}</span> : <span className="text-ink-3">اختار المنتج</span>}
            </button>
          </Field>
        ) : (
          <Field label="الاسم">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: شاحن آيفون أصلي" />
          </Field>
        )}
        <Field label="الحالة">
          <Segmented
            value={low}
            onChange={setLow}
            options={[
              { value: 'out', label: 'خلص' },
              { value: 'low', label: 'قرب يخلص' },
            ]}
          />
        </Field>
        <Field label="ملاحظة (اختياري)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: الزبون طلب 3، أو هات اللون الأسود" />
        </Field>
      </div>
      <ProductPicker open={picking} onClose={() => setPicking(false)} pickVariant={false} onPick={(p) => setPv(p)} />
    </Modal>
  )
}

function SetupBanner({ owner }: { owner: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sqlSetup)
      toast('تم نسخ الكود')
    } catch {
      toast('مقدرناش ننسخ', 'error')
    }
  }
  return (
    <div className="card mb-4 border-orange/40 bg-orange-light p-4">
      <div className="font-extrabold text-orange">قايمة النواقص اللي بتتضاف بالإيد محتاجة تتفعّل مرة واحدة على السيرفر</div>
      {owner ? (
        <>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-sm leading-6 text-ink-2">
            <li>دوس "نسخ كود التفعيل" تحت.</li>
            <li>افتح supabase.com ← مشروع المحل ← SQL Editor ← New query.</li>
            <li>الزق الكود ودوس Run. بعدها ارجع هنا واعمل تحديث للصفحة.</li>
          </ol>
          <Button variant="soft" size="sm" className="mt-3" icon={<ClipboardCopy className="h-4 w-4" />} onClick={copy}>
            نسخ كود التفعيل
          </Button>
        </>
      ) : (
        <div className="mt-1 text-sm text-ink-2">كلم المدير يفعّلها من صفحة النواقص. لحد ما يتفعّل، المنتجات اللي خلصت بتظهر هنا عادي.</div>
      )}
    </div>
  )
}
