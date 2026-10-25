import { AlertCircle, CheckCircle2, Info, Loader2, Search, X } from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { makeRange, money, rangeLabels, ymd, type DateRange, type RangeKey } from '@/lib/format'
import { dismiss, useToasts } from '@/lib/toast'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

// ───────── المقاس ─────────

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 999px)') : null
function subscribeMq(cb: () => void) {
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
export function useIsMobile() {
  return useSyncExternalStore(
    subscribeMq,
    () => mq?.matches ?? false,
    () => false,
  )
}

// ───────── الأزرار ─────────

type BtnVariant = 'primary' | 'soft' | 'outline' | 'danger' | 'danger-soft' | 'green' | 'ghost'
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'md' | 'sm'
  icon?: ReactNode
  loading?: boolean
  block?: boolean
}
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {children}
    </button>
  )
})

export function IconButton({ className, label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('icon-btn', className)} {...rest}>
      {children}
    </button>
  )
}

// ───────── الكروت والعناوين ─────────

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={cx('card', onClick && 'cursor-pointer', className)} onClick={onClick}>
      {children}
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="hidden text-2xl font-extrabold lg:block">{title}</h1>
        {sub && <div className="text-sm text-ink-3 lg:mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

const tagColors = {
  green: 'bg-green-light text-green',
  red: 'bg-red-light text-red',
  orange: 'bg-orange-light text-orange',
  purple: 'bg-purple-light text-purple',
  teal: 'bg-teal-light text-teal',
  primary: 'bg-primary-light text-primary',
  gray: 'bg-bg text-ink-3',
}
export type Color = keyof typeof tagColors
export function Tag({ color = 'gray', children, className }: { color?: Color; children: ReactNode; className?: string }) {
  return <span className={cx('tag', tagColors[color], className)}>{children}</span>
}

const textColors: Record<Color, string> = {
  green: 'text-green',
  red: 'text-red',
  orange: 'text-orange',
  purple: 'text-purple',
  teal: 'text-teal',
  primary: 'text-primary',
  gray: 'text-ink',
}

export function Stat({
  label,
  value,
  sub,
  color = 'gray',
  icon,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  color?: Color
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('card min-w-0 p-3 lg:p-4', className)}>
      <div className="flex items-center gap-1.5 text-xs font-bold text-ink-3 lg:text-sm">
        {icon && <span className={cx('hidden lg:inline', textColors[color])}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={cx('mt-1 truncate text-base font-extrabold lg:text-2xl', textColors[color])}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-ink-3 lg:text-xs">{sub}</div>}
    </div>
  )
}

/** كروت الأرقام: 3 في السطر على الموبايل */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const lg = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }[cols]
  return <div className={cx('mb-4 grid grid-cols-3 gap-2 lg:gap-3', lg)}>{children}</div>
}

export function Money({ v, className, currency = true }: { v: number; className?: string; currency?: boolean }) {
  return (
    <span className={cx('whitespace-nowrap', className)}>
      <span className="num">{money(v)}</span>
      {currency && <span className="text-[0.8em] font-medium"> ج.م</span>}
    </span>
  )
}

export function Empty({ icon, text, children }: { icon?: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-ink-3">
      {icon && <div className="text-ink-3/60 [&>svg]:h-12 [&>svg]:w-12">{icon}</div>}
      <div className="font-bold">{text}</div>
      {children}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-6 w-6 animate-spin text-primary', className)} />
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-6 text-center">
      <AlertCircle className="h-8 w-8 text-red" />
      <div className="font-bold text-ink-2">{text}</div>
      {onRetry && (
        <Button variant="soft" size="sm" onClick={onRetry}>
          جرب تاني
        </Button>
      )}
    </div>
  )
}

// ───────── الخانات ─────────

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block min-w-0', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs font-bold text-red">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />
})

/** خانة رقم: بتفتح كيبورد الأرقام على الموبايل وبتقبل الأرقام العربية */
export const NumInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { decimal?: boolean }>(function NumInput(
  { className, decimal = true, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      dir="ltr"
      className={cx('input text-right', className)}
      onFocus={(e) => e.currentTarget.select()}
      {...rest}
    />
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, rows = 2, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('input resize-none', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input appearance-none bg-[length:12px] bg-[left_12px_center] bg-no-repeat pl-8', className)} style={{ backgroundImage: selectArrow }} {...rest}>
      {children}
    </select>
  )
}
const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237A879F' stroke-width='2' fill='none'/%3E%3C/svg%3E")`

export function Checkbox({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex min-h-10 cursor-pointer items-center gap-3 py-1', disabled && 'opacity-50')}>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-ink-2">{label}</span>
        {sub && <span className="block text-xs text-ink-3">{sub}</span>}
      </span>
    </label>
  )
}

export function SearchBox({ value, onChange, placeholder = 'بحث...', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cx('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        className="input pl-9 pr-10"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" aria-label="مسح" className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-ink-3" onClick={() => onChange('')}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** أزرار اختيار (بتنزل لسطر جديد بدل ما تستخبى) */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  className,
  scroll,
}: {
  options: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (v: T) => void
  className?: string
  /** صف واحد بيتسحب بالعرض على الموبايل (ويلف عادي على الكمبيوتر) */
  scroll?: boolean
}) {
  return (
    <div className={cx('flex gap-2', scroll ? 'scrollbar-none -mx-3 overflow-x-auto px-3 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0' : 'flex-wrap', className)}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={cx('chip', o.value === value && 'chip-on')} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className={cx('num text-xs', o.value === value ? 'text-white/80' : 'text-ink-3')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-btn bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx('h-10 flex-1 rounded-[10px] px-3 text-sm font-bold transition-colors', o.value === value ? 'bg-white text-primary shadow-card' : 'text-ink-3')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ───────── فلتر الفترة ─────────

export function RangeFilter({ value, onChange, keys = ['today', 'week', 'month', 'all'] }: { value: DateRange; onChange: (r: DateRange) => void; keys?: RangeKey[] }) {
  const [from, setFrom] = useState(ymd(value.from))
  const [to, setTo] = useState(ymd(new Date(value.to.getTime() - 1)))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {keys.map((k) => (
        <button key={k} type="button" className={cx('chip', value.key === k && 'chip-on')} onClick={() => onChange(makeRange(k))}>
          {rangeLabels[k]}
        </button>
      ))}
      <button
        type="button"
        className={cx('chip', value.key === 'custom' && 'chip-on')}
        onClick={() => onChange(makeRange('custom', from, to))}
      >
        فترة مخصصة
      </button>
      {value.key === 'custom' && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            type="date"
            className="input h-10 w-auto min-w-[9.5rem] flex-1"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value)
              if (e.target.value) onChange(makeRange('custom', e.target.value, to))
            }}
          />
          <span className="text-sm text-ink-3">إلى</span>
          <input
            type="date"
            className="input h-10 w-auto min-w-[9.5rem] flex-1"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value)
              if (e.target.value) onChange(makeRange('custom', from, e.target.value))
            }}
          />
        </div>
      )}
    </div>
  )
}

// ───────── النوافذ (bottom sheet على الموبايل) ─────────

let openModals = 0
function lockScroll(on: boolean) {
  openModals += on ? 1 : -1
  document.documentElement.style.overflow = openModals > 0 ? 'hidden' : ''
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dismissable?: boolean
}) {
  const mobile = useIsMobile()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    lockScroll(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      lockScroll(false)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, dismissable])
  if (!open) return null
  const w = { sm: 'lg:max-w-md', md: 'lg:max-w-xl', lg: 'lg:max-w-3xl', xl: 'lg:max-w-5xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-ink/40" onClick={() => dismissable && onClose()} />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col bg-white',
          mobile ? 'anim-sheet rounded-t-[20px] shadow-sheet' : cx('anim-pop rounded-card shadow-xl', w),
        )}
      >
        {mobile && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" />}
        {title != null && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5 lg:px-5 lg:py-3">
            <div className="min-w-0 text-lg font-extrabold">{title}</div>
            {dismissable && (
              <IconButton label="قفل" onClick={onClose} className="-ml-2">
                <X className="h-5 w-5" />
              </IconButton>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 lg:px-5">{children}</div>
        {footer && <div className="pb-safe shrink-0 border-t border-line-soft px-4 py-3 lg:px-5">{footer}</div>}
        {!footer && mobile && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  )
}

// ───────── تأكيد وسؤال ─────────

interface DialogReq {
  id: number
  title: string
  message?: ReactNode
  ok: string
  cancel: string
  danger?: boolean
  input?: { label?: string; value: string; type?: string; placeholder?: string; numeric?: boolean }
  resolve: (v: string | boolean | null) => void
}
const useDialogs = create<{ list: DialogReq[] }>(() => ({ list: [] }))
let dseq = 0

export function confirmDialog(o: { title: string; message?: ReactNode; ok?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.setState((s) => ({
      list: [...s.list, { id: ++dseq, ok: 'تأكيد', cancel: 'إلغاء', ...o, resolve: (v) => resolve(v === true) }],
    }))
  })
}

export function promptDialog(o: {
  title: string
  message?: ReactNode
  label?: string
  value?: string
  type?: string
  placeholder?: string
  numeric?: boolean
  ok?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogs.setState((s) => ({
      list: [
        ...s.list,
        {
          id: ++dseq,
          title: o.title,
          message: o.message,
          ok: o.ok ?? 'حفظ',
          cancel: 'إلغاء',
          input: { label: o.label, value: o.value ?? '', type: o.type, placeholder: o.placeholder, numeric: o.numeric },
          resolve: (v) => resolve(typeof v === 'string' ? v : null),
        },
      ],
    }))
  })
}

function DialogView({ d }: { d: DialogReq }) {
  const [val, setVal] = useState(d.input?.value ?? '')
  const close = (v: string | boolean | null) => {
    d.resolve(v)
    useDialogs.setState((s) => ({ list: s.list.filter((x) => x.id !== d.id) }))
  }
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(null)}
      title={d.title}
      footer={
        <div className="flex gap-2">
          <Button
            variant={d.danger ? 'danger' : 'primary'}
            className="flex-1"
            onClick={() => close(d.input ? val : true)}
          >
            {d.ok}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => close(null)}>
            {d.cancel}
          </Button>
        </div>
      }
    >
      {d.message && <div className="whitespace-pre-line text-[15px] leading-7 text-ink-2">{d.message}</div>}
      {d.input && (
        <form
          className={cx(d.message ? 'mt-3' : '')}
          onSubmit={(e) => {
            e.preventDefault()
            close(val)
          }}
        >
          <Field label={d.input.label}>
            {d.input.numeric ? (
              <NumInput autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder={d.input.placeholder} />
            ) : (
              <Input autoFocus type={d.input.type ?? 'text'} value={val} onChange={(e) => setVal(e.target.value)} placeholder={d.input.placeholder} />
            )}
          </Field>
        </form>
      )}
    </Modal>
  )
}

export function DialogHost() {
  const list = useDialogs((s) => s.list)
  return (
    <>
      {list.map((d) => (
        <DialogView key={d.id} d={d} />
      ))}
    </>
  )
}

// ───────── الرسايل ─────────

export function Toasts() {
  const list = useToasts((s) => s.list)
  if (!list.length) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
      {list.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'anim-pop pointer-events-auto flex max-w-md items-start gap-2 rounded-btn px-4 py-3 text-[15px] font-bold shadow-lg',
            t.kind === 'error' ? 'bg-red text-white' : t.kind === 'info' ? 'bg-ink text-white' : 'bg-green text-white',
          )}
        >
          {t.kind === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : t.kind === 'info' ? <Info className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
          <span className="whitespace-pre-line">{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// ───────── جدول بيتحول كروت على الموبايل ─────────

export interface Col<T> {
  label: string
  render: (row: T) => ReactNode
  className?: string
  /** القيمة فاضية؟ (عشان متظهرش في كارت الموبايل) */
  empty?: (row: T) => boolean
}

export function DataTable<T>({
  rows,
  cols,
  rowKey,
  onRow,
  rowClass,
  empty = 'مفيش بيانات',
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string | number
  onRow?: (r: T) => void
  rowClass?: (r: T) => string | undefined
  empty?: string
}) {
  const mobile = useIsMobile()
  if (!rows.length) return <Empty text={empty} />
  if (mobile) {
    const [first, ...rest] = cols
    return (
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={rowKey(r)} className={cx('card p-3', onRow && 'cursor-pointer active:bg-bg', rowClass?.(r))} onClick={onRow ? () => onRow(r) : undefined}>
            <div className="mb-2 font-extrabold">{first.render(r)}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              {rest
                .filter((c) => !c.empty?.(r))
                .map((c) => (
                  <div key={c.label} className="min-w-0">
                    <div className="text-[11px] font-bold text-ink-3">{c.label}</div>
                    <div className="truncate text-sm font-bold text-ink-2">{c.render(r)}</div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg/60 text-ink-3">
          <tr>
            {cols.map((c) => (
              <th key={c.label} className={cx('px-3 py-3 text-right font-bold', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={cx('border-t border-line-soft', onRow && 'cursor-pointer hover:bg-bg/60', rowClass?.(r))}
              onClick={onRow ? () => onRow(r) : undefined}
            >
              {cols.map((c) => (
                <td key={c.label} className={cx('px-3 py-3 font-medium text-ink-2', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** صف "عنوان ← قيمة" في التفاصيل */
export function KV({ k, v, strong, color }: { k: ReactNode; v: ReactNode; strong?: boolean; color?: Color }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-ink-3">{k}</span>
      <span className={cx('text-left', strong ? 'text-lg font-extrabold' : 'font-bold', color ? textColors[color] : 'text-ink-2')}>{v}</span>
    </div>
  )
}
