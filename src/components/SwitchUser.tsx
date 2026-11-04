import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { errMsg, q } from '@/lib/api'
import { switchUser, useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { useNav } from '@/lib/nav'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import { useLive } from '@/lib/useLive'
import { Button, Field, Input, Loading, Modal, Tag } from './ui'

const close = () => useNav.setState({ switchOpen: false })

/** تبديل المستخدم على جهاز مشترك: كل واحد بيدخل بالباسورد بتاعه، فكل عملية بتتسجل باسمه هو */
export function SwitchUser() {
  const open = useNav((s) => s.switchOpen)
  return open ? <SwitchDialog /> : null
}

function SwitchDialog() {
  const me = useAuth((s) => s.profile)
  const inCart = useCart((s) => s.lines.length)
  const members = useLive('members', ['profiles'], async () => (await q(supabase.from('profiles').select().eq('shop_id', me!.shop_id).order('created_at'))) as Profile[])
  const [picked, setPicked] = useState<Profile | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = (members.data ?? []).filter((m) => m.active && m.id !== me?.id)

  const pick = (m: Profile | null) => {
    setPicked(m)
    setPassword('')
    setError(null)
  }

  const submit = async () => {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      await switchUser(picked.username, password)
      close()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={picked ? `الدخول باسم ${picked.name}` : 'تبديل المستخدم'}
      footer={
        picked ? (
          <div className="flex gap-2">
            <Button variant="outline" icon={<ChevronRight className="h-5 w-5" />} disabled={busy} onClick={() => pick(null)}>
              رجوع
            </Button>
            <Button block loading={busy} onClick={submit}>
              دخول
            </Button>
          </div>
        ) : undefined
      }
    >
      {picked ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="الباسورد" error={error}>
            {/* new-password: عشان المتصفح ميملاش باسورد محفوظ لواحد تاني على الجهاز المشترك */}
            <Input type="password" autoComplete="new-password" dir="ltr" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {inCart > 0 && <div className="rounded-btn bg-orange-light px-3 py-2 text-sm font-bold text-orange">السلة فيها منتجات، والبيع هيتسجل باسم اللي هيكمله</div>}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      ) : members.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="py-8 text-center font-bold text-ink-3">مفيش مستخدمين تانيين في المحل لسه</div>
      ) : (
        <div className="space-y-2">
          {list.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m)}
              className="flex min-h-14 w-full items-center gap-3 rounded-btn border border-line bg-white px-3 py-2 text-right transition-colors hover:border-primary active:bg-primary-light/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-extrabold text-primary">{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate font-extrabold">{m.name}</span>
              {m.role === 'owner' && <Tag color="primary">المدير</Tag>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
