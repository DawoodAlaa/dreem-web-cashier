import { Clock, Eye, EyeOff, KeyRound, LogOut, Smartphone, Store, Trash2, UserPlus, Users } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Checkbox, ErrorBox, Field, Input, Segmented, Spinner, confirmDialog, cx } from '@/components/ui'
import { errMsg } from '@/lib/api'
import { createShop, joinShop, linkShop, refreshProfile, signIn, signOut, useAuth, type LoginOpts } from '@/lib/auth'
import { accountPassword, lastUsername, listAccounts, removeAccount, type SavedAccount } from '@/lib/savedAccounts'
import { getRemember } from '@/lib/supabase'
import { toast } from '@/lib/toast'

function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] items-start justify-center px-4 py-8 lg:items-center">
      <div className={cx('w-full', wide ? 'max-w-lg' : 'max-w-md')}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-primary text-white shadow-lg shadow-primary/25">
            <Smartphone className="h-8 w-8" />
          </div>
          <div>
            <div className="text-2xl font-extrabold">نظام كاشير الموبايلات</div>
            <div className="mt-1 text-sm text-ink-3">البيع والمخزون والحسابات من أي موبايل</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  inputRef,
  name = 'password',
}: {
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  inputRef?: React.RefObject<HTMLInputElement>
  name?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        name={name}
        type={show ? 'text' : 'password'}
        dir="ltr"
        className="pl-11 text-right"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={show ? 'إخفاء الباسورد' : 'إظهار الباسورد'}
        className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-ink-3"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

function UsernameInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      name="username"
      dir="ltr"
      className="text-right"
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
      placeholder="ahmed"
    />
  )
}

/** اختيارات حفظ بيانات الدخول (في تسجيل الدخول وإنشاء الحساب) */
function SaveOptions({ opts, setOpts }: { opts: LoginOpts; setOpts: (o: LoginOpts) => void }) {
  return (
    <div className="rounded-btn bg-bg px-3 py-1">
      <Checkbox
        checked={opts.remember}
        onChange={(v) => setOpts({ ...opts, remember: v })}
        label="افتكرني على الجهاز ده"
        sub="هتفضل داخل حتى لو قفلت المتصفح، ومش هتحتاج تسجل دخول تاني"
      />
      <Checkbox
        checked={opts.savePassword}
        onChange={(v) => setOpts({ ...opts, savePassword: v })}
        label="احفظ اسم المستخدم والباسورد"
        sub="لو خرجت، تدخل تاني بضغطة واحدة من غير ما تكتبهم"
      />
    </div>
  )
}

function useLoginOpts() {
  return useState<LoginOpts>(() => ({ remember: getRemember(), savePassword: true }))
}

// ───────── تسجيل الدخول ─────────

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'join' | 'create'>('login')
  if (mode !== 'login') return <RegisterPage initial={mode} onBack={() => setMode('login')} />
  return <Login onRegister={setMode} />
}

function Login({ onRegister }: { onRegister: (m: 'join' | 'create') => void }) {
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => listAccounts())
  const [username, setUsername] = useState(() => (accounts.length ? '' : lastUsername()))
  const [password, setPassword] = useState('')
  const [opts, setOpts] = useLoginOpts()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const passRef = useRef<HTMLInputElement>(null)

  const login = async (u: string, p: string, key: string) => {
    setBusy(key)
    setError(null)
    try {
      await signIn(u, p, opts)
    } catch (e) {
      setError(errMsg(e))
      setBusy(null)
    }
  }

  const quick = (a: SavedAccount) => {
    const pw = accountPassword(a)
    if (pw) {
      void login(a.username, pw, a.username)
    } else {
      setUsername(a.username)
      setPassword('')
      setTimeout(() => passRef.current?.focus(), 0)
    }
  }

  const forget = async (a: SavedAccount) => {
    const ok = await confirmDialog({
      title: 'مسح الحساب المحفوظ',
      message: `هيتمسح "${a.name || a.username}" من الجهاز ده بس. الحساب نفسه مش هيتمسح.`,
      ok: 'مسح',
      danger: true,
    })
    if (!ok) return
    removeAccount(a.username)
    setAccounts(listAccounts())
  }

  return (
    <Shell>
      {accounts.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-3">
            <KeyRound className="h-4 w-4" />
            دخول سريع بالحسابات المحفوظة
          </div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.username} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => quick(a)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-btn border border-line bg-white px-3 py-2 text-right transition-colors hover:border-primary hover:bg-primary-light/50 disabled:opacity-60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-extrabold text-primary">
                    {(a.name || a.username).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{a.name || a.username}</span>
                    <span className="block truncate text-xs text-ink-3" dir="ltr">
                      {a.username}
                      {a.shopName ? ` • ${a.shopName}` : ''}
                    </span>
                  </span>
                  {busy === a.username ? <Spinner className="h-5 w-5" /> : <span className="text-sm font-bold text-primary">{a.secret ? 'دخول' : 'اكتب الباسورد'}</span>}
                </button>
                <button
                  type="button"
                  aria-label="مسح من الجهاز"
                  className="icon-btn text-ink-3 hover:text-red"
                  onClick={() => forget(a)}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void login(username, password, 'form')
        }}
      >
        <div className="text-lg font-extrabold">{accounts.length ? 'أو ادخل بحساب تاني' : 'تسجيل الدخول'}</div>
        <Field label="اسم المستخدم">
          <UsernameInput value={username} onChange={setUsername} autoFocus={!accounts.length && !username} />
        </Field>
        <Field label="الباسورد">
          <PasswordInput inputRef={passRef} value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <SaveOptions opts={opts} setOpts={setOpts} />
        {error && <div className="rounded-btn bg-red-light px-3 py-2.5 text-sm font-bold text-red">{error}</div>}
        <Button type="submit" block loading={busy === 'form'} disabled={!!busy && busy !== 'form'}>
          دخول
        </Button>
      </form>

      <div className="mt-4 space-y-2">
        <Button variant="outline" block icon={<Users className="h-5 w-5" />} onClick={() => onRegister('join')}>
          موظف جديد؟ انضم لمحل بالكود
        </Button>
        <Button variant="ghost" block icon={<Store className="h-5 w-5" />} onClick={() => onRegister('create')}>
          صاحب محل؟ اعمل حساب للمحل بتاعك
        </Button>
      </div>
    </Shell>
  )
}

// ───────── إنشاء حساب (محل جديد أو انضمام موظف) ─────────

function RegisterPage({ initial, onBack }: { initial: 'join' | 'create'; onBack: () => void }) {
  const [mode, setMode] = useState(initial)
  const [f, setF] = useState({ code: '', shopName: '', name: '', username: '', password: '' })
  const [opts, setOpts] = useLoginOpts()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') {
        const r = await createShop({ ...f, ownerName: f.name }, opts)
        toast(`تم إنشاء المحل. كود انضمام الموظفين: ${r.join_code}`)
      } else {
        await joinShop(f, opts)
        toast('تم إنشاء الحساب. استنى المدير يفعّلك')
      }
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <UserPlus className="h-5 w-5 text-primary" />
          حساب جديد
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'join', label: 'موظف (بالكود)' },
            { value: 'create', label: 'صاحب محل' },
          ]}
        />
        {mode === 'join' ? (
          <Field label="كود المحل" hint="6 حروف، المدير بيلاقيه في صفحة المستخدمين">
            <Input
              dir="ltr"
              className="text-center text-xl font-extrabold tracking-[0.3em]"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              value={f.code}
              onChange={(e) => set('code')(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="ABC123"
            />
          </Field>
        ) : (
          <Field label="اسم المحل">
            <Input value={f.shopName} onChange={(e) => set('shopName')(e.target.value)} autoComplete="organization" />
          </Field>
        )}
        <Field label="اسمك">
          <Input value={f.name} onChange={(e) => set('name')(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="اسم المستخدم" hint="حروف إنجليزي أو أرقام من غير مسافات (هتدخل بيه بعد كده)">
          <UsernameInput value={f.username} onChange={set('username')} />
        </Field>
        <Field label="الباسورد" hint="6 حروف أو أرقام على الأقل">
          <PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <SaveOptions opts={opts} setOpts={setOpts} />
        {error && <div className="rounded-btn bg-red-light px-3 py-2.5 text-sm font-bold text-red">{error}</div>}
        <Button type="submit" block loading={busy}>
          {mode === 'create' ? 'إنشاء المحل' : 'إنشاء الحساب'}
        </Button>
      </form>
      <Button variant="ghost" block className="mt-3" onClick={onBack}>
        رجوع لتسجيل الدخول
      </Button>
    </Shell>
  )
}

// ───────── مستني التفعيل ─────────

export function PendingPage() {
  const profile = useAuth((s) => s.profile)
  return (
    <Shell>
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-light text-orange">
          <Clock className="h-8 w-8" />
        </div>
        <div className="text-xl font-extrabold">مستني المدير يفعّلك</div>
        <div className="text-[15px] leading-7 text-ink-2">
          أهلاً {profile?.name}. حسابك اتعمل، وظهر عند المدير في صفحة المستخدمين.
          <br />
          أول ما يفعّلك هتدخل البرنامج على طول من غير ما تعمل حاجة.
        </div>
        <div className="rounded-btn bg-bg px-4 py-2 text-sm text-ink-3">
          اسم المستخدم: <b dir="ltr">{profile?.username}</b>
        </div>
        <div className="flex w-full gap-2">
          <Button variant="soft" className="flex-1" onClick={() => void refreshProfile()}>
            تحديث
          </Button>
          <Button variant="outline" className="flex-1" icon={<LogOut className="h-5 w-5" />} onClick={() => void signOut()}>
            تسجيل خروج
          </Button>
        </div>
      </div>
    </Shell>
  )
}

// ───────── حساب من غير محل ─────────

export function LinkShopPage() {
  const session = useAuth((s) => s.session)
  const username = session?.user.email?.split('@')[0] ?? ''
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [shopName, setShopName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await linkShop(mode, { code, name, shopName })
    } catch (e) {
      setError(errMsg(e))
    }
    setBusy(false)
  }
  return (
    <Shell>
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div>
          <div className="text-lg font-extrabold">اربط حسابك بمحل</div>
          <div className="mt-1 text-sm text-ink-3">
            اسم المستخدم: <b dir="ltr">{username}</b>
          </div>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'join', label: 'موظف (بالكود)' },
            { value: 'create', label: 'صاحب محل' },
          ]}
        />
        {mode === 'join' ? (
          <Field label="كود المحل">
            <Input dir="ltr" className="text-center text-xl font-extrabold tracking-[0.3em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        ) : (
          <Field label="اسم المحل">
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </Field>
        )}
        <Field label="اسمك">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <div className="rounded-btn bg-red-light px-3 py-2.5 text-sm font-bold text-red">{error}</div>}
        <Button type="submit" block loading={busy}>
          ربط
        </Button>
      </form>
      <Button variant="ghost" block className="mt-3" icon={<LogOut className="h-5 w-5" />} onClick={() => void signOut()}>
        تسجيل خروج
      </Button>
    </Shell>
  )
}

export function BootScreen() {
  const status = useAuth((s) => s.status)
  const error = useAuth((s) => s.error)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(t)
  }, [])
  if (status === 'error')
    return (
      <Shell>
        <ErrorBox text={error ?? 'حصل خطأ'} onRetry={() => location.reload()} />
        <Button variant="ghost" block className="mt-3" icon={<LogOut className="h-5 w-5" />} onClick={() => void signOut()}>
          تسجيل خروج
        </Button>
      </Shell>
    )
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-primary text-white">
        <Smartphone className="h-8 w-8" />
      </div>
      <Spinner />
      {slow && <div className="text-sm text-ink-3">بنحمّل البيانات... لو النت ضعيف ممكن ياخد وقت</div>}
    </div>
  )
}
