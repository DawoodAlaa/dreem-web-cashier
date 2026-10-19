import type { RealtimeChannel } from '@supabase/supabase-js'
import { useMemo } from 'react'
import { create } from 'zustand'
import { rpc } from './api'
import { onResync } from './realtime'
import { assemblable, splitSource, useShop } from './shop'
import { supabase } from './supabase'
import type { ProductView } from './types'

// النواقص اللي اتضافت بالإيد (جدول shortages — supabase/09_shortages.sql).
// لو الجدول لسه متعملش على السيرفر، الموقع بيشتغل عادي والصفحة بتقول للمدير يعمله.

export interface Shortage {
  id: number
  product_id: number | null
  name: string
  note: string | null
  user_name: string | null
  done: boolean
  done_at: string | null
  created_at: string
}

interface State {
  ready: boolean // الجدول موجود على السيرفر
  missing: boolean // الجدول لسه متعملش
  list: Shortage[]
}

export const useShortages = create<State>(() => ({ ready: false, missing: false, list: [] }))

let channel: RealtimeChannel | null = null
let offResync: (() => void) | null = null
let timer = 0

async function load() {
  const { data, error } = await supabase.from('shortages').select().order('done').order('id', { ascending: false }).limit(500)
  if (error) {
    // PGRST205 / 42P01 = الجدول مش موجود
    if (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message)) {
      useShortages.setState({ ready: false, missing: true, list: [] })
    }
    return
  }
  useShortages.setState({ ready: true, missing: false, list: data as Shortage[] })
  if (!channel) {
    // قناة لوحدها: لو الجدول مش موجود، القناة الأساسية متتأثرش
    channel = supabase
      .channel(`shortages-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shortages' }, () => {
        clearTimeout(timer)
        timer = window.setTimeout(() => void load(), 250)
      })
      .subscribe()
  }
}

export function startShortages() {
  stopShortages()
  offResync = onResync(() => void load())
  void load()
}

export function stopShortages() {
  offResync?.()
  offResync = null
  if (channel) void supabase.removeChannel(channel)
  channel = null
  useShortages.setState({ ready: false, missing: false, list: [] })
}

export const reloadShortages = () => load()

export async function addShortage(productId: number | null, name: string | null, note: string | null) {
  await rpc('shortage_add', { p_product: productId, p_name: name, p_note: note })
  await load()
}
export async function setShortageDone(id: number, done: boolean) {
  await rpc('shortage_done', { p_id: id, p_done: done })
  await load()
}
export async function deleteShortage(id: number) {
  await rpc('shortage_delete', { p_id: id })
  await load()
}
export async function clearDoneShortages() {
  const n = await rpc<number>('shortage_clear_done')
  await load()
  return Number(n) || 0
}

/** المنتجات اللي كميتها خلصت (المتجرد بس)، من غير اللي ممكن يتفك أو يتجمّع */
export function useOutOfStock(): { pv: ProductView; colors: string[] }[] {
  const views = useShop((s) => s.views)
  const parts = useShop((s) => s.parts)
  return useMemo(() => {
    const out: { pv: ProductView; colors: string[] }[] = []
    for (const pv of views) {
      if (pv.p.is_used) continue
      const empty = pv.vs.filter((v) => !v.uncounted && v.stock <= 0)
      if (!empty.length) continue
      if (pv.outOfStock && (splitSource(pv) || assemblable(pv))) continue
      out.push({ pv, colors: pv.hasVariants ? empty.map((v) => v.name ?? '') : [] })
    }
    return out.sort((a, b) => a.pv.p.name.localeCompare(b.pv.p.name, 'ar'))
    // parts بيأثر على الفك والتجميع
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, parts])
}

export function useShortageCount() {
  const auto = useOutOfStock()
  const list = useShortages((s) => s.list)
  const manualIds = new Set(list.filter((x) => !x.done && x.product_id).map((x) => x.product_id))
  return list.filter((x) => !x.done).length + auto.filter((a) => !manualIds.has(a.pv.p.id)).length
}
