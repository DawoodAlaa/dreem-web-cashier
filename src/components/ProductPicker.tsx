import { useMemo, useState } from 'react'
import { norm } from '@/lib/format'
import { useShop } from '@/lib/shop'
import type { ProductView, Variant } from '@/lib/types'
import { ProductImage } from './ProductForm'
import { Modal, Money, SearchBox, Tag, cx } from './ui'

/** نافذة اختيار منتج (ولونه لو ليه ألوان) */
export function ProductPicker({
  open,
  onClose,
  onPick,
  title = 'اختيار منتج',
  pickVariant = true,
  filter,
  showCost,
  onlySellable,
}: {
  open: boolean
  onClose: () => void
  onPick: (pv: ProductView, v: Variant) => void
  title?: string
  pickVariant?: boolean
  filter?: (pv: ProductView) => boolean
  showCost?: boolean
  onlySellable?: boolean
}) {
  const views = useShop((s) => s.views)
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<ProductView | null>(null)
  const list = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean)
    const out: ProductView[] = []
    for (const v of views) {
      if (filter && !filter(v)) continue
      if (tokens.length && !tokens.every((t) => v.key.includes(t))) continue
      out.push(v)
      if (out.length >= 120) break
    }
    return out
  }, [views, q, filter])

  const pick = (pv: ProductView) => {
    if (pickVariant && pv.vs.length > 1) return setChosen(pv)
    onPick(pv, pv.vs[0])
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={chosen ? chosen.p.name : title}>
      {chosen ? (
        <div className="space-y-2">
          <div className="text-sm font-bold text-ink-3">اختار اللون</div>
          {chosen.vs.map((v) => {
            const dis = onlySellable && !v.uncounted && v.stock <= 0
            return (
              <button
                key={v.id}
                type="button"
                disabled={dis}
                className={cx('flex min-h-12 w-full items-center justify-between rounded-btn border border-line px-3 text-right hover:border-primary', dis && 'opacity-40')}
                onClick={() => {
                  onPick(chosen, v)
                  setChosen(null)
                  onClose()
                }}
              >
                <span className="font-bold">{v.name ?? 'عادي'}</span>
                <span className="text-sm text-ink-3">{v.uncounted ? 'لسه متجردش' : `الكمية ${v.stock}`}</span>
              </button>
            )
          })}
          <button type="button" className="mt-2 text-sm font-bold text-primary" onClick={() => setChosen(null)}>
            رجوع للمنتجات
          </button>
        </div>
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} autoFocus placeholder="بحث بالاسم أو IMEI" className="mb-3" />
          <div className="space-y-1.5">
            {list.map((pv) => {
              const dis = onlySellable && pv.outOfStock
              return (
                <button
                  key={pv.p.id}
                  type="button"
                  disabled={dis}
                  onClick={() => pick(pv)}
                  className={cx('flex w-full items-center gap-3 rounded-btn border border-line p-2 text-right hover:border-primary', dis && 'opacity-40')}
                >
                  <ProductImage url={pv.p.image_url} className="h-11 w-11 shrink-0 rounded-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{pv.p.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <Money v={pv.p.sell_price} className="font-bold text-green" />
                      {showCost && (
                        <span>
                          جملة <Money v={pv.p.cost_price} />
                        </span>
                      )}
                      <span>{pv.allUncounted ? 'لسه متجردش' : `الكمية ${pv.stock}`}</span>
                      {pv.hasVariants && <Tag color="gray">{pv.vs.length} ألوان</Tag>}
                    </div>
                  </div>
                </button>
              )
            })}
            {list.length === 0 && <div className="py-8 text-center text-ink-3">مفيش منتجات مطابقة</div>}
          </div>
        </>
      )}
    </Modal>
  )
}
