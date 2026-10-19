import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { Layout } from './components/Layout'
import { DialogHost, Loading, Toasts } from './components/ui'
import { initAuth, useAuth } from './lib/auth'
import { PAGES, canOpen, go, useNav, type PageId } from './lib/nav'
import { BootScreen, LinkShopPage, LoginPage, PendingPage } from './pages/Auth'
import SalesPage from './pages/Sales'

const pages: Record<PageId, ComponentType> = {
  sales: SalesPage,
  invoices: lazy(() => import('./pages/Invoices')),
  products: lazy(() => import('./pages/Products')),
  inventory: lazy(() => import('./pages/Inventory')),
  purchases: lazy(() => import('./pages/Purchases')),
  compat: lazy(() => import('./pages/Compat')),
  customers: lazy(() => import('./pages/Customers')),
  expenses: lazy(() => import('./pages/Expenses')),
  drawer: lazy(() => import('./pages/Drawer')),
  reports: lazy(() => import('./pages/Reports')),
  log: lazy(() => import('./pages/Log')),
  users: lazy(() => import('./pages/Users')),
  backup: lazy(() => import('./pages/Backup')),
  settings: lazy(() => import('./pages/Settings')),
}

function Main() {
  const page = useNav((s) => s.page)
  const profile = useAuth((s) => s.profile)
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
      <Toasts />
      <DialogHost />
    </>
  )
}
