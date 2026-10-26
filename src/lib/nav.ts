import { create } from 'zustand'
import { can, isOwner } from './auth'
import { isTrackStock, useShop } from './shop'
import type { Perm, Profile } from './types'

export type PageId =
  | 'sales'
  | 'today'
  | 'invoices'
  | 'products'
  | 'inventory'
  | 'purchases'
  | 'compat'
  | 'customers'
  | 'expenses'
  | 'drawer'
  | 'reports'
  | 'log'
  | 'shortages'
  | 'salaries'
  | 'users'
  | 'backup'
  | 'settings'

export const PAGES: { id: PageId; label: string; perms: Perm[] | 'owner' }[] = [
  { id: 'sales', label: 'المبيعات', perms: ['sell'] },
  { id: 'today', label: 'النهارده', perms: ['reports', 'drawer', 'log'] },
  { id: 'invoices', label: 'الفواتير', perms: ['sell', 'returns'] },
  { id: 'products', label: 'المنتجات', perms: ['products', 'stock'] },
  { id: 'inventory', label: 'جرد المخزون', perms: ['stock'] },
  { id: 'shortages', label: 'النواقص', perms: ['sell', 'products', 'stock', 'purchases'] },
  { id: 'purchases', label: 'المشتريات', perms: ['purchases'] },
  { id: 'compat', label: 'التوفيقات', perms: ['sell', 'products', 'stock', 'purchases'] },
  { id: 'customers', label: 'العملاء والآجل', perms: ['customers', 'credit'] },
  { id: 'expenses', label: 'المصاريف', perms: ['expenses'] },
  { id: 'drawer', label: 'تصفية الدرج', perms: ['drawer'] },
  { id: 'reports', label: 'تقرير الأرباح', perms: ['reports'] },
  { id: 'log', label: 'السجل', perms: ['log'] },
  {
    id: 'salaries',
    label: 'المرتبات',
    perms: ['sell', 'discount', 'credit', 'returns', 'customers', 'products', 'stock', 'purchases', 'used', 'expenses', 'drawer', 'reports', 'log', 'undo', 'settings', 'salaries'],
  },
  { id: 'users', label: 'المستخدمين', perms: 'owner' },
  { id: 'backup', label: 'النسخ الاحتياطي', perms: 'owner' },
  { id: 'settings', label: 'الإعدادات', perms: ['settings'] },
]

// الصفحات اللي بتختفي لما متابعة الكميات تتقفل
const STOCK_PAGES: PageId[] = ['inventory', 'purchases']

export function canOpen(page: PageId, profile: Profile | null): boolean {
  const def = PAGES.find((p) => p.id === page)
  if (!def || !profile) return false
  if (STOCK_PAGES.includes(page) && !isTrackStock(useShop.getState().settings)) return false
  if (def.perms === 'owner') return isOwner(profile)
  return def.perms.some((p) => can(p, profile))
}

export function pageLabel(id: PageId) {
  return PAGES.find((p) => p.id === id)?.label ?? ''
}

function fromHash(): { page: PageId; arg: string | null } {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '')
  const [page, arg] = h.split('/')
  const ok = PAGES.some((p) => p.id === page)
  return { page: ok ? (page as PageId) : 'sales', arg: arg ? decodeURIComponent(arg) : null }
}

interface NavState {
  page: PageId
  arg: string | null // مثلاً رقم الفاتورة أو العميل المفتوح
  menuOpen: boolean
  salesQuery: string | null // بحث جاي من شريط البحث السريع
}

export const useNav = create<NavState>(() => ({ ...fromHash(), menuOpen: false, salesQuery: null }))

export function go(page: PageId, arg: string | null = null) {
  const h = `#/${page}${arg != null ? '/' + encodeURIComponent(arg) : ''}`
  if (location.hash !== h) history.pushState(null, '', h)
  useNav.setState({ page, arg, menuOpen: false })
  window.scrollTo({ top: 0 })
}

/** بيغيّر الجزء التاني من العنوان (مثلاً فتح فاتورة) من غير ما يغيّر الصفحة */
export function setArg(arg: string | null, replace = false) {
  const { page } = useNav.getState()
  const h = `#/${page}${arg != null ? '/' + encodeURIComponent(arg) : ''}`
  if (location.hash !== h) {
    if (replace) history.replaceState(null, '', h)
    else history.pushState(null, '', h)
  }
  useNav.setState({ arg })
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useNav.setState({ ...fromHash() }))
}
