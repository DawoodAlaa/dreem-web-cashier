import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// القوايم الطويلة: الصفوف اللي باينة على الشاشة بس هي اللي بتترسم (السكرول على الصفحة نفسها عشان يبقى ناعم على الآيفون)

function useOffsetTop(ref: React.RefObject<HTMLElement | null>) {
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setTop(el.getBoundingClientRect().top + window.scrollY)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [ref])
  return top
}

export function VirtualList<T>({
  items,
  estimate,
  render,
  getKey,
  gap = 8,
}: {
  items: T[]
  estimate: number
  render: (item: T, index: number) => ReactNode
  getKey: (item: T) => string | number
  gap?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const top = useOffsetTop(ref)
  const v = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimate + gap,
    overscan: 6,
    scrollMargin: top,
    getItemKey: (i) => getKey(items[i]),
  })
  return (
    <div ref={ref} style={{ height: v.getTotalSize(), position: 'relative' }}>
      {v.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={v.measureElement}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${row.start - v.options.scrollMargin}px)`, paddingBottom: gap }}
        >
          {render(items[row.index], row.index)}
        </div>
      ))}
    </div>
  )
}

/** شبكة كروت: عدد الأعمدة بيتحسب من عرض المساحة */
export function VirtualGrid<T>({
  items,
  minWidth,
  rowHeight,
  render,
  getKey,
  gap = 10,
}: {
  items: T[]
  minWidth: number
  rowHeight: number
  render: (item: T) => ReactNode
  getKey: (item: T) => string | number
  gap?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const top = useOffsetTop(ref)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const cols = Math.max(2, Math.floor((width + gap) / (minWidth + gap)) || 2)
  const rows = Math.ceil(items.length / cols)
  const v = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowHeight + gap,
    overscan: 4,
    scrollMargin: top,
  })
  return (
    <div ref={ref} style={{ height: v.getTotalSize(), position: 'relative' }}>
      {v.getVirtualItems().map((row) => {
        const slice = items.slice(row.index * cols, row.index * cols + cols)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={v.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${row.start - v.options.scrollMargin}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap,
              paddingBottom: gap,
            }}
          >
            {slice.map((it) => (
              <div key={getKey(it)} className="min-w-0">
                {render(it)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
