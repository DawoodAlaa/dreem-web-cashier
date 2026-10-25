import {
  BarChart3,
  Bell,
  CloudUpload,
  FileText,
  History,
  ListTodo,
  KeyRound,
  LogOut,
  Menu,
  PackageSearch,
  Repeat2,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  HandCoins,
  House,
  WifiOff,
  ClipboardCheck,
  Landmark,
  ChevronDown,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { changeMyPassword, signOut, useAuth } from '@/lib/auth'
import { int } from '@/lib/format'
import { PAGES, canOpen, go, pageLabel, useNav, type PageId } from '@/lib/nav'
import { onStatus } from '@/lib/realtime'
import { useShortageCount } from '@/lib/shortages'
import { useShop } from '@/lib/shop'
import { run } from '@/lib/toast'
import { Button, Field, IconButton, Input, Modal, Tag, cx } from './ui'

const ICONS: Record<PageId, LucideIcon> = {
  sales: ShoppingCart,
  today: House,
  invoices: FileText,
  products: PackageSearch,
  inventory: ClipboardCheck,
  purchases: Truck,
  compat: Repeat2,
  customers: Users,
  expenses: Wallet,
  salaries: HandCoins,
  drawer: Landmark,
  reports: BarChart3,
  log: History,
  shortages: ListTodo,
  users: UserCog,
  backup: CloudUpload,
  settings: Settings,
}

function NavList({ onPick }: { onPick?: () => void }) {
  const profile = useAuth((s) => s.profile)
  const page = useNav((s) => s.page)
  const items = PAGES.filter((p) => canOpen(p.id, profile))
  const shortages = useShortageCount()
  return (
    <nav className="space-y-1">
      {items.map((p) => {
        const I = ICONS[p.id]
        const on = p.id === page
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              go(p.id)
              onPick?.()
            }}
            className={cx(
              'flex h-11 w-full items-center gap-3 rounded-btn px-3 text-[15px] font-bold transition-colors',
              on ? 'bg-primary text-white' : 'text-ink-2 hover:bg-bg',
            )}
          >
            <I className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-right">{p.label}</span>
            {p.id === 'shortages' && shortages > 0 && (
              <span className={cx('num rounded-full px-2 text-xs font-extrabold', on ? 'bg-white/25 text-white' : 'bg-red-light text-red')}>{shortages}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

function Brand() {
  const shopName = useAuth((s) => s.shopName)
  const settings = useShop((s) => s.settings)
  const name = settings.shop_name || shopName || 'كاشير الموبايلات'
  return (
    <div className="min-w-0">
      <div className="truncate text-lg font-extrabold">{name}</div>
      {settings.shop_sub && <div className="truncate text-xs text-ink-3">{settings.shop_sub}</div>}
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    let t = 0
    const off = onStatus((v) => {
      clearTimeout(t)
      // متظهرش التنبيه في أول ثواني (القناة لسه بتتوصل)
      if (v) setOnline(true)
      else t = window.setTimeout(() => setOnline(false), 4000)
    })
    const onOff = () => setOnline(navigator.onLine)
    window.addEventListener('online', onOff)
    window.addEventListener('offline', onOff)
    return () => {
      off()
      clearTimeout(t)
      window.removeEventListener('online', onOff)
      window.removeEventListener('offline', onOff)
    }
  }, [])
  return online
}

// ───────── جرس المخزون ─────────

function LowStockBell() {
  const views = useShop((s) => s.views)
  const low = useMemo(() => views.filter((v) => v.isLow && !v.p.is_used).sort((a, b) => a.stock - b.stock), [views])
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton label="تنبيهات المخزون" onClick={() => setOpen(true)} className="relative">
        <Bell className="h-5 w-5" />
        {low.length > 0 && (
          <span className="absolute -top-0.5 left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1 text-[11px] font-extrabold text-white">
            {low.length > 99 ? '99+' : low.length}
          </span>
        )}
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title={`قربت تخلص (${int(low.length)})`}>
        {low.length === 0 ? (
          <div className="py-8 text-center font-bold text-ink-3">كل المنتجات كميتها كويسة</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {low.slice(0, 300).map((v) => (
              <div key={v.p.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate font-bold">{v.p.name}</div>
                  <Tag color={v.stock <= 0 ? 'red' : 'orange'}>{v.stock <= 0 ? 'خلص' : `باقي ${v.stock}`}</Tag>
                </div>
                {v.hasVariants && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.vs
                      .filter((x) => !x.uncounted && x.stock <= v.p.min_stock)
                      .map((x) => (
                        <Tag key={x.id} color={x.stock <= 0 ? 'red' : 'orange'}>
                          {x.name}: {x.stock}
                        </Tag>
                      ))}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-ink-3">حد التنبيه: {v.p.min_stock}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}

// ───────── قايمة المستخدم ─────────

function UserMenu({ compact }: { compact?: boolean }) {
  const profile = useAuth((s) => s.profile)
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!profile) return null
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-10 items-center gap-2 rounded-btn hover:bg-bg', compact ? 'w-10 justify-center' : 'px-2')}
        aria-label="قايمة المستخدم"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light font-extrabold text-primary">{profile.name.slice(0, 1)}</span>
        {!compact && (
          <>
            <span className="max-w-[10rem] truncate text-sm font-bold">{profile.name}</span>
            <ChevronDown className="h-4 w-4 text-ink-3" />
          </>
        )}
      </button>
      {open && (
        <div className="anim-pop absolute left-0 top-12 z-40 w-60 rounded-card border border-line bg-white p-2 shadow-xl">
          <div className="border-b border-line-soft px-2 pb-2">
            <div className="font-extrabold">{profile.name}</div>
            <div className="text-xs text-ink-3" dir="ltr">
              {profile.username}
            </div>
            <Tag color={profile.role === 'owner' ? 'primary' : 'gray'} className="mt-1">
              {profile.role === 'owner' ? 'المدير' : 'موظف'}
            </Tag>
          </div>
          <button
            type="button"
            className="mt-1 flex h-10 w-full items-center gap-2 rounded-btn px-2 text-sm font-bold text-ink-2 hover:bg-bg"
            onClick={() => {
              setOpen(false)
              setPw(true)
            }}
          >
            <KeyRound className="h-4 w-4" /> تغيير الباسورد
          </button>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2 rounded-btn px-2 text-sm font-bold text-red hover:bg-red-light"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </button>
        </div>
      )}
      <ChangePassword open={pw} onClose={() => setPw(false)} />
    </div>
  )
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setA('')
      setB('')
      setErr(null)
    }
  }, [open])
  const save = async () => {
    if (a !== b) return setErr('الباسورد والتأكيد مش زي بعض')
    setBusy(true)
    const ok = await run(() => changeMyPassword(a), 'تم تغيير الباسورد')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="تغيير الباسورد"
      footer={
        <Button block loading={busy} onClick={save}>
          حفظ
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="الباسورد الجديد" hint="6 حروف أو أرقام على الأقل">
          <Input type="password" autoComplete="new-password" dir="ltr" value={a} onChange={(e) => setA(e.target.value)} />
        </Field>
        <Field label="تأكيد الباسورد" error={err}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={b} onChange={(e) => setB(e.target.value)} />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  )
}

// ───────── شريط التنقل اللي تحت (الموبايل) ─────────

// أهم الصفحات بالترتيب، وبناخد أول 4 مسموحة للمستخدم. الباقي في "المزيد"
const TABS: PageId[] = ['sales', 'today', 'invoices', 'products', 'reports', 'drawer', 'customers', 'expenses', 'inventory']
const SHORT: Partial<Record<PageId, string>> = { reports: 'الأرباح', drawer: 'الدرج', customers: 'العملاء', inventory: 'الجرد' }

/** وإحنا بنكتب على الموبايل الكيبورد بيطلع، فبنخفي الشريط عشان ميغطيش الشاشة */
function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const isField = (el: Element | null) =>
      !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes((el as HTMLInputElement).type)))
    let t = 0
    const on = (e: FocusEvent) => {
      clearTimeout(t)
      if (isField(e.target as Element)) setTyping(true)
    }
    const off = () => {
      clearTimeout(t)
      t = window.setTimeout(() => setTyping(isField(document.activeElement)), 120)
    }
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => {
      clearTimeout(t)
      document.removeEventListener('focusin', on)
      document.removeEventListener('focusout', off)
    }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('kb', typing)
  }, [typing])
  return typing
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const profile = useAuth((s) => s.profile)
  const page = useNav((s) => s.page)
  const shortages = useShortageCount()
  const typing = useTyping()
  const tabs = TABS.filter((id) => canOpen(id, profile)).slice(0, 4)
  const inMore = !tabs.includes(page)
  if (typing) return null
  const item = (on: boolean) => cx('flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[12px] font-bold transition-colors', on ? 'text-primary' : 'text-ink-3')
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
      <div className="flex">
        {tabs.map((id) => {
          const I = ICONS[id]
          const on = id === page
          return (
            <button key={id} type="button" className={item(on)} onClick={() => go(id)}>
              <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', on && 'bg-primary-light')}>
                <I className="h-[22px] w-[22px]" />
              </span>
              {SHORT[id] ?? pageLabel(id)}
            </button>
          )
        })}
        <button type="button" className={item(inMore)} onClick={onMore}>
          <span className={cx('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors', inMore && 'bg-primary-light')}>
            <Menu className="h-[22px] w-[22px]" />
            {shortages > 0 && !tabs.includes('shortages') && <span className="absolute right-3 top-0.5 h-2.5 w-2.5 rounded-full bg-red ring-2 ring-white" />}
          </span>
          {inMore ? pageLabel(page) : 'المزيد'}
        </button>
      </div>
    </nav>
  )
}

function QuickSearch() {
  const [q, setQ] = useState('')
  return (
    <form
      className="w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault()
        useNav.setState({ salesQuery: q })
        go('sales')
        setQ('')
      }}
    >
      <Input type="search" placeholder="بحث سريع عن منتج..." value={q} onChange={(e) => setQ(e.target.value)} className="h-10 lg:h-10" enterKeyHint="search" />
    </form>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const page = useNav((s) => s.page)
  const menuOpen = useNav((s) => s.menuOpen)
  const profile = useAuth((s) => s.profile)
  const online = useOnline()
  const setMenu = (v: boolean) => useNav.setState({ menuOpen: v })

  return (
    <div className="min-h-[100dvh] lg:pr-[248px]">
      {/* القايمة الجانبية (الكمبيوتر) */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[248px] flex-col border-l border-line bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line-soft px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-primary text-white">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
      </aside>

      {/* الشريط اللي فوق */}
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-2 lg:h-16 lg:px-5">
          <div className="min-w-0 flex-1 truncate px-2 text-lg font-extrabold lg:hidden">{pageLabel(page)}</div>
          <div className="hidden flex-1 items-center gap-4 lg:flex">
            <span className="text-sm font-bold text-ink-3">كاشير الموبايلات</span>
            {profile && canOpen('sales', profile) && <QuickSearch />}
          </div>
          {!online && (
            <span className="flex items-center gap-1 rounded-full bg-red-light px-2 py-1 text-xs font-bold text-red">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">مفيش اتصال</span>
            </span>
          )}
          <LowStockBell />
          <div className="hidden lg:block">
            <UserMenu />
          </div>
          <div className="lg:hidden">
            <UserMenu compact />
          </div>
        </div>
      </header>

      {/* القايمة الجانبية (الموبايل) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} />
          <div className="anim-drawer pt-safe pb-safe absolute inset-y-0 right-0 flex w-[82%] max-w-[300px] flex-col bg-white shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line-soft px-4">
              <Brand />
              <IconButton label="قفل" onClick={() => setMenu(false)}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList onPick={() => setMenu(false)} />
            </div>
            <div className="border-t border-line-soft p-3">
              <Button variant="danger-soft" block icon={<LogOut className="h-5 w-5" />} onClick={() => void signOut()}>
                تسجيل الخروج
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] px-3 pb-[calc(var(--bnav)+1rem)] pt-4 lg:px-6 lg:py-6">{children}</main>
      <BottomNav onMore={() => setMenu(true)} />
    </div>
  )
}
