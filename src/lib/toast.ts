import { create } from 'zustand'
import { errMsg } from './api'

export type ToastKind = 'ok' | 'error' | 'info'
export interface Toast {
  id: number
  msg: string
  kind: ToastKind
}

export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))
let seq = 0

export function toast(msg: string, kind: ToastKind = 'ok', ms = kind === 'error' ? 5000 : 3000) {
  const id = ++seq
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, msg, kind }] }))
  setTimeout(() => dismiss(id), ms)
}
export const toastError = (e: unknown) => toast(errMsg(e), 'error')
export function dismiss(id: number) {
  useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }))
}

/** بينفذ العملية ويعرض رسالة نجاح أو الخطأ. بيرجع true لو نجحت */
export async function run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn()
    if (success) toast(success)
    return true
  } catch (e) {
    toastError(e)
    return false
  }
}
