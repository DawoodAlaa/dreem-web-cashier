import {
  AlertTriangle,
  Banknote,
  HandCoins,
  Boxes,
  Landmark,
  Package,
  PauseCircle,
  Receipt,
  Repeat,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Color } from './ui'

// شكل كل نوع عملية في السجل (الأيقونة واللون). بتستخدمه صفحة السجل وشاشة النهارده

export function actionStyle(a: string): { icon: LucideIcon; color: Color } {
  if (a === 'sale') return { icon: ShoppingCart, color: 'green' }
  if (a === 'return') return { icon: RotateCcw, color: 'red' }
  if (a === 'exchange') return { icon: Repeat, color: 'purple' }
  if (a.startsWith('hold')) return { icon: PauseCircle, color: 'gray' }
  if (a === 'expense') return { icon: Wallet, color: 'red' }
  if (a === 'loss') return { icon: AlertTriangle, color: 'orange' }
  if (a.includes('payment')) return { icon: Banknote, color: 'teal' }
  if (a === 'settlement' || a === 'deposit') return { icon: Landmark, color: 'primary' }
  if (a.startsWith('purchase') || a.startsWith('supplier')) return { icon: Truck, color: 'purple' }
  if (a.includes('stock') || a.includes('count') || a.includes('split') || a.includes('assemble')) return { icon: Boxes, color: 'orange' }
  if (a.startsWith('product') || a.includes('price') || a.includes('offer') || a.includes('compat') || a.includes('category') || a.includes('parts') || a === 'used_buy')
    return { icon: Package, color: 'primary' }
  if (a === 'settings') return { icon: Settings, color: 'gray' }
  if (a === 'member' || a.startsWith('shop')) return { icon: UserCog, color: 'gray' }
  if (a === 'undo') return { icon: Undo2, color: 'red' }
  if (a.startsWith('salary')) return { icon: HandCoins, color: 'teal' }
  return { icon: Receipt, color: 'gray' }
}

export const iconBg: Record<Color, string> = {
  green: 'bg-green-light text-green',
  red: 'bg-red-light text-red',
  orange: 'bg-orange-light text-orange',
  purple: 'bg-purple-light text-purple',
  teal: 'bg-teal-light text-teal',
  primary: 'bg-primary-light text-primary',
  gray: 'bg-bg text-ink-3',
}
