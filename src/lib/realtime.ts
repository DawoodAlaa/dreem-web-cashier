import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'

// قناة Realtime واحدة لكل الجداول. أي تغيير بيوصل للمشتركين، ولما القناة تتوصل تاني بعد ما النت يقطع
// (أو الموبايل يرجع من الخلفية) بنبعت "resync" عشان كل حاجة تتجاب من الأول ومفيش تحديث يفوت.

export const TABLES = [
  'categories', 'products', 'variants', 'product_parts', 'compat_groups', 'compat_devices', 'customers', 'customer_txns',
  'invoices', 'adjustments', 'held_carts', 'cash_moves', 'offers', 'offer_items', 'activity_logs', 'app_settings',
  'profiles', 'suppliers', 'supplier_txns', 'purchases', 'expenses', 'losses', 'settlements',
] as const

export type Change = RealtimePostgresChangesPayload<Record<string, unknown>>
type ChangeFn = (c: Change) => void
type VoidFn = () => void

const changeSubs = new Set<ChangeFn>()
const resyncSubs = new Set<VoidFn>()
const statusSubs = new Set<(online: boolean) => void>()

let channel: RealtimeChannel | null = null
let wasSubscribed = false
let hiddenAt = 0
let connected = false

export function onChange(fn: ChangeFn): VoidFn {
  changeSubs.add(fn)
  return () => changeSubs.delete(fn)
}
export function onResync(fn: VoidFn): VoidFn {
  resyncSubs.add(fn)
  return () => resyncSubs.delete(fn)
}
export function onStatus(fn: (online: boolean) => void): VoidFn {
  statusSubs.add(fn)
  fn(connected)
  return () => statusSubs.delete(fn)
}
export const isConnected = () => connected

function setConnected(v: boolean) {
  if (connected === v) return
  connected = v
  statusSubs.forEach((f) => f(v))
}

export function resync() {
  resyncSubs.forEach((f) => f())
}

export function startRealtime() {
  if (channel) return
  wasSubscribed = false
  const ch = supabase.channel(`shop-db-${Date.now()}`)
  for (const t of TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
      changeSubs.forEach((f) => f(p as Change))
    })
  }
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setConnected(true)
      if (wasSubscribed) resync()
      wasSubscribed = true
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setConnected(false)
    }
  })
  channel = ch
}

export async function stopRealtime() {
  const ch = channel
  channel = null
  setConnected(false)
  if (ch) await supabase.removeChannel(ch)
}

// سفاري على الآيفون بيقفل الاتصال لما التطبيق يروح الخلفية: لما يرجع بنعيد التحميل
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
    } else if (channel && hiddenAt && Date.now() - hiddenAt > 15000) {
      hiddenAt = 0
      // القناة ممكن تكون اتقفلت من غير ما نعرف: نقفلها ونفتحها تاني
      void stopRealtime().then(() => {
        startRealtime()
        resync()
      })
    }
  })
  window.addEventListener('online', () => {
    if (channel) resync()
  })
}
