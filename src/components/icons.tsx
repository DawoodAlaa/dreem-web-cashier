import {
  BatteryCharging,
  Box,
  Cable,
  Gem,
  Headphones,
  MemoryStick,
  MonitorSmartphone,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Speaker,
  Watch,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  phone: { icon: Smartphone, label: 'موبايلات' },
  used: { icon: RefreshCcw, label: 'مستعمل' },
  charger: { icon: PlugZap, label: 'شواحن' },
  headphones: { icon: Headphones, label: 'سماعات' },
  screen: { icon: MonitorSmartphone, label: 'اسكرينات' },
  case: { icon: ShieldCheck, label: 'جرابات' },
  cable: { icon: Cable, label: 'كابلات' },
  accessory: { icon: Gem, label: 'اكسسوارات' },
  watch: { icon: Watch, label: 'ساعات' },
  battery: { icon: BatteryCharging, label: 'بطاريات' },
  memory: { icon: MemoryStick, label: 'ميموري' },
  speaker: { icon: Speaker, label: 'سماعات خارجية' },
  box: { icon: Box, label: 'عام' },
}

export function CategoryIcon({ icon, className = 'h-5 w-5' }: { icon: string; className?: string }) {
  const I = CATEGORY_ICONS[icon]?.icon ?? Box
  return <I className={className} />
}
