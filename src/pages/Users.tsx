import { CheckCircle2, Copy, KeyRound, SlidersHorizontal, Star, Trash2, UserPlus, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Tag, confirmDialog, cx } from '@/components/ui'
import { q as one, rpc } from '@/lib/api'
import { PERM_LABELS, createMember, useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { run, toast } from '@/lib/toast'
import type { Perm, Profile } from '@/lib/types'
import { useLive } from '@/lib/useLive'

const ALL_PERMS = Object.keys(PERM_LABELS) as Perm[]
const permsOf = (on: Perm[]) => Object.fromEntries(ALL_PERMS.map((p) => [p, on.includes(p)])) as Record<Perm, boolean>

export default function UsersPage() {
  const me = useAuth((s) => s.profile)
  const code = useLive('join_code', [], () => rpc<string>('shop_join_code'))
  const members = useLive('members', ['profiles'], async () => (await one(supabase.from('profiles').select().eq('shop_id', me!.shop_id).order('created_at'))) as Profile[])
  const [perm, setPerm] = useState<Profile | null>(null)
  const [pw, setPw] = useState<Profile | null>(null)
  const [adding, setAdding] = useState(false)
  const list = members.data ?? []
  const pending = list.filter((m) => !m.active && m.role !== 'owner')
  const others = list.filter((m) => m.active || m.role === 'owner')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.data ?? '')
      toast('تم نسخ الكود')
    } catch {
      toast('مقدرناش ننسخ. اكتب الكود يدوي', 'error')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="المستخدمين"
        actions={
          <Button icon={<UserPlus className="h-5 w-5" />} onClick={() => setAdding(true)}>
            إضافة مستخدم
          </Button>
        }
      />

      {members.loading ? (
        <Loading />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-lg font-extrabold text-orange">مش متفعّلين ({pending.length})</div>
              <div className="space-y-2">
                {pending.map((m) => (
                  <MemberCard key={m.id} m={m} onPerms={() => setPerm(m)} onPassword={() => setPw(m)} />
                ))}
              </div>
            </div>
          )}
          <div className="mb-2 text-lg font-extrabold">المستخدمين ({others.length})</div>
          {others.length === 0 ? (
            <Empty text="مفيش مستخدمين" />
          ) : (
            <div className="space-y-2">
              {others.map((m) => (
                <MemberCard key={m.id} m={m} isMe={m.id === me?.id} onPerms={() => setPerm(m)} onPassword={() => setPw(m)} />
              ))}
            </div>
          )}
        </>
      )}
      <div className="card mt-6 p-5 text-center">
        <div className="text-sm font-bold text-ink-3">أو خلي الموظف يسجّل بنفسه بكود المحل</div>
        <div className="my-2 select-all text-4xl font-extrabold tracking-[0.25em] text-primary" dir="ltr">
          {code.data ?? '······'}
        </div>
        <Button variant="soft" icon={<Copy className="h-5 w-5" />} onClick={copy} disabled={!code.data}>
          نسخ الكود
        </Button>
        <div className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-2">
          الموظف يفتح الموقع ويدوس <b>"موظف جديد؟ انضم لمحل بالكود"</b>، وبعدها هيظهرلك هنا وتفعّله وتحدد صلاحياته.
        </div>
      </div>
      {adding && <AddMemberModal onClose={() => setAdding(false)} onDone={members.reload} />}
      {perm && <PermsModal m={perm} onClose={() => setPerm(null)} onDone={members.reload} />}
      {pw && <PasswordModal m={pw} onClose={() => setPw(null)} />}
    </div>
  )
}

function MemberCard({ m, isMe, onPerms, onPassword }: { m: Profile; isMe?: boolean; onPerms: () => void; onPassword: () => void }) {
  const owner = m.role === 'owner'
  const count = ALL_PERMS.filter((p) => m.perms?.[p]).length
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', owner ? 'bg-primary text-white' : m.active ? 'bg-green-light text-green' : 'bg-orange-light text-orange')}>
        {owner ? <Star className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-extrabold">{m.name}</span>
          {isMe && <Tag color="primary">أنت</Tag>}
        </div>
        <div className="truncate text-xs text-ink-3">
          <span dir="ltr">{m.username}</span> • {owner ? 'المدير (كل الصلاحيات)' : m.active ? `${count} صلاحية` : 'مستني التفعيل / موقوف'}
        </div>
      </div>
      {!owner && (
        <>
          <Button size="sm" variant={m.active ? 'soft' : 'green'} icon={m.active ? <SlidersHorizontal className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} onClick={onPerms}>
            {m.active ? 'الصلاحيات' : 'تفعيل'}
          </Button>
          <button type="button" className="icon-btn" aria-label="تغيير الباسورد" title="تغيير الباسورد" onClick={onPassword}>
            <KeyRound className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  )
}

/** الصلاحيات الجاهزة والقايمة كلها */
function PermsPicker({ perms, onChange }: { perms: Record<Perm, boolean>; onChange: (p: Record<Perm, boolean>) => void }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={() => onChange(permsOf(['sell', 'discount']))}>
          كاشير (بيع بس)
        </button>
        <button type="button" className="chip" onClick={() => onChange(permsOf(['sell', 'discount', 'credit', 'returns', 'customers']))}>
          كاشير + مرتجع وآجل
        </button>
        <button type="button" className="chip" onClick={() => onChange(permsOf(ALL_PERMS))}>
          كل الصلاحيات
        </button>
      </div>
      <div className="divide-y divide-line-soft">
        {ALL_PERMS.map((p) => (
          <Checkbox key={p} checked={perms[p]} onChange={(v) => onChange({ ...perms, [p]: v })} label={PERM_LABELS[p]} />
        ))}
      </div>
    </>
  )
}

function AddMemberModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => permsOf(['sell', 'discount']))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => createMember({ name, username, password, perms }), `تم إضافة ${name.trim()}`)
    setBusy(false)
    if (ok) {
      onDone()
      onClose()
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة مستخدم"
      footer={
        <Button block loading={busy} disabled={!name.trim() || !username.trim() || password.length < 6} onClick={save}>
          إضافة
        </Button>
      }
    >
      <div className="mb-3 space-y-3">
        <Field label="الاسم" hint="الاسم اللي هيظهر في الفواتير والسجل">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="اسم المستخدم" hint="حروف إنجليزي أو أرقام، من غير مسافات">
          <Input dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="الباسورد" hint="6 حروف أو أرقام على الأقل. قوله للموظف عشان يدخل بيه">
          <Input dir="ltr" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <PermsPicker perms={perms} onChange={setPerms} />
    </Modal>
  )
}

function PermsModal({ m, onClose, onDone }: { m: Profile; onClose: () => void; onDone: () => void }) {
  const [perms, setPerms] = useState<Record<Perm, boolean>>(() => permsOf(ALL_PERMS.filter((p) => m.perms?.[p] === true)))
  const [name, setName] = useState(m.name)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    const yes = await confirmDialog({
      title: 'مسح المستخدم',
      message: `حساب ${m.name} هيتمسح نهائي ومش هيقدر يدخل تاني. فواتيره وعملياته القديمة هتفضل باسمه.`,
      ok: 'مسح',
      danger: true,
    })
    if (!yes) return
    setBusy(true)
    const ok = await run(() => rpc('delete_member', { p_user: m.id }), `تم مسح ${m.name}`)
    setBusy(false)
    if (ok) {
      onDone()
      onClose()
    }
  }
  const save = async (active: boolean) => {
    if (!active && !(await confirmDialog({ title: 'إيقاف الحساب', message: `${m.name} مش هيقدر يدخل البرنامج لحد ما تفعّله تاني`, ok: 'إيقاف', danger: true }))) return
    setBusy(true)
    const ok = await run(
      () => rpc('set_member', { p_user: m.id, p_active: active, p_perms: perms, p_name: name.trim() || null }),
      active ? (m.active ? 'تم حفظ الصلاحيات' : `تم تفعيل ${m.name}`) : 'تم إيقاف الحساب',
    )
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`صلاحيات ${m.name}`}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} onClick={() => save(true)}>
            {m.active ? 'حفظ' : 'تفعيل وحفظ'}
          </Button>
          {m.active && (
            <Button variant="danger-soft" disabled={busy} onClick={() => save(false)}>
              إيقاف الحساب
            </Button>
          )}
        </div>
      }
    >
      <Field label="الاسم" className="mb-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <PermsPicker perms={perms} onChange={setPerms} />
      <button type="button" disabled={busy} onClick={remove} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-btn text-sm font-bold text-red hover:bg-red-light disabled:opacity-50">
        <Trash2 className="h-4 w-4" /> مسح المستخدم
      </button>
    </Modal>
  )
}

function PasswordModal({ m, onClose }: { m: Profile; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await run(() => rpc('reset_member_password', { p_user: m.id, p_password: pw }), `تم تغيير باسورد ${m.name}`)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`باسورد جديد لـ ${m.name}`}
      footer={
        <Button block loading={busy} disabled={pw.length < 6} onClick={save}>
          حفظ
        </Button>
      }
    >
      <Field label="الباسورد الجديد" hint="6 حروف أو أرقام على الأقل. قوله للموظف عشان يدخل بيه">
        <Input autoFocus dir="ltr" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
    </Modal>
  )
}
