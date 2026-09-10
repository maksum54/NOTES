import { useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/** Segmented control ala iOS, lengkap dengan thumb yang meluncur. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const index = options.findIndex((o) => o.value === value)
    const measure = () => {
      const el = wrap.querySelectorAll<HTMLButtonElement>('[data-seg]')[index]
      if (!el) return
      setThumb({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [value, options])

  return (
    <div ref={wrapRef} className={cx('segmented', className)} role="tablist">
      {thumb && (
        <span
          className="segmented-thumb"
          style={{ transform: `translateX(${thumb.left - 4}px)`, width: thumb.width }}
          aria-hidden="true"
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-seg
          role="tab"
          aria-selected={opt.value === value}
          data-active={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={cx('segmented-item', size === 'sm' && 'px-2.5 py-1 text-[12px]')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
