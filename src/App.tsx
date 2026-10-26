import { RefreshCw } from 'lucide-react'
import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { Layout } from './components/Layout'
import { DialogHost, Loading, Toasts } from './components/ui'
import { initAuth, useAuth } from './lib/auth'
import { PAGES, canOpen, go, useNav, type PageId } from './lib/nav'
import { useTrackStock } from './lib/shop'
import { reloadApp, retryChunk, useUpdateAvailable } from './lib/updates'
import { BootScreen, LinkShopPage, LoginPage, PendingPage } from './pages/Auth'
import SalesPage from './pages/Sales'

function UpdateBar() {
  const ready = useUpdateAvailable()
  if (!ready) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={reloadApp}
        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-sheet active:scale-95"
      >
        <RefreshCw className="h-4 w-4" />
        في تحديث جديد للبرنامج • دوس عشان تحدّث
      </button>
    </div>
  )
}

const pages: Record<PageId, ComponentType> = {
  sales: SalesPage,
  today: lazy(retryChunk(() => import('./pages/Today'))),
  invoices: lazy(retryChunk(() => import('./pages/Invoices'))),
  products: lazy(retryChunk(() => import('./pages/Products'))),
  inventory: lazy(retryChunk(() => import('./pages/Inventory'))),
  purchases: lazy(retryChunk(() => import('./pages/Purchases'))),
  compat: lazy(retryChunk(() => import('./pages/Compat'))),
  customers: lazy(retryChunk(() => import('./pages/Customers'))),
  expenses: lazy(retryChunk(() => import('./pages/Expenses'))),
  drawer: lazy(retryChunk(() => import('./pages/Drawer'))),
  reports: lazy(retryChunk(() => import('./pages/Reports'))),
  log: lazy(retryChunk(() => import('./pages/Log'))),
  shortages: lazy(retryChunk(() => import('./pages/Shortages'))),
  users: lazy(retryChunk(() => import('./pages/Users'))),
  salaries: lazy(retryChunk(() => import('./pages/Salaries'))),
  backup: lazy(retryChunk(() => import('./pages/Backup'))),
  settings: lazy(retryChunk(() => import('./pages/Settings'))),
}

function Main() {
  const page = useNav((s) => s.page)
  const profile = useAuth((s) => s.profile)
  useTrackStock()
  const allowed = canOpen(page, profile)
  useEffect(() => {
    if (!allowed) {
      const first = PAGES.find((p) => canOpen(p.id, profile))
      if (first) go(first.id)
    }
  }, [allowed, profile])
  if (!allowed) {
    return PAGES.some((p) => canOpen(p.id, profile)) ? null : (
      <div className="card p-8 text-center font-bold text-ink-3">مفيش صفحات مسموحة لحسابك. كلم المدير يديك صلاحيات.</div>
    )
  }
  const Page = pages[page]
  return (
    <Suspense fallback={<Loading />}>
      <Page key={page} />
    </Suspense>
  )
}

export default function App() {
  const status = useAuth((s) => s.status)
  useEffect(() => initAuth(), [])
  let body
  if (status === 'loading' || status === 'error') body = <BootScreen />
  else if (status === 'signedOut') body = <LoginPage />
  else if (status === 'noProfile') body = <LinkShopPage />
  else if (status === 'pending') body = <PendingPage />
  else
    body = (
      <Layout>
        <Main />
      </Layout>
    )
  return (
    <>
      {body}
      <UpdateBar />
      <Toasts />
      <DialogHost />
    </>
  )
}
