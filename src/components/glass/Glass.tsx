import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from '@/lib/utils'

/* ============================================================
   Kit komponen "Apple Glass" — dipakai di seluruh halaman.
   ============================================================ */

/* ---------- Card ---------- */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  hover?: boolean
  sheen?: boolean
  padded?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, CardProps>(function GlassCard(
  { strong, hover, sheen = true, padded = true, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx(
        strong ? 'glass-strong' : 'glass',
        sheen && 'glass-sheen',
        hover && 'glass-hover',
        padded && 'p-5',
        'rounded-glass',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})

/* ---------- Button ---------- */

type Variant = 'primary' | 'glass' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white border border-accent/40 shadow-[0_6px_20px_-6px_rgb(var(--accent)/0.7)] hover:brightness-110 active:brightness-95',
  glass:
    'glass text-ink hover:border-glass-border/60 active:scale-[0.985]',
  ghost:
    'bg-transparent text-ink-soft hover:text-ink hover:bg-glass-bg/20 border border-transparent',
  danger:
    'bg-danger/90 text-white border border-danger/40 shadow-[0_6px_20px_-6px_rgb(var(--danger)/0.6)] hover:brightness-110',
  success:
    'bg-ok/90 text-white border border-ok/40 shadow-[0_6px_20px_-6px_rgb(var(--ok)/0.6)] hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-[15px] gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl py-3.5',
  icon: 'h-10 w-10 rounded-xl justify-center',
}

export const GlassButton = forwardRef<HTMLButtonElement, ButtonProps>(function GlassButton(
  { variant = 'glass', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold',
        'transition-all duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/* ---------- Field ---------- */

interface FieldWrapProps {
  label?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
  /**
   * Pakai untuk kontrol MAJEMUK (mis. Segmented yang isinya banyak tombol).
   *
   * Tanpa ini, <label> otomatis terasosiasi ke kontrol pertama di dalamnya:
   * screen reader membacakan nama yang kacau, dan mengklik teks label malah
   * mengaktifkan tombol pertama — mis. klik "Tema" langsung mengubah ke Terang.
   */
  group?: boolean
}

export function Field({ label, hint, error, children, className, group }: FieldWrapProps) {
  const labelId = useId()
  const caption = error ? (
    <span className="mt-1.5 block text-[12px] font-medium text-danger">{error}</span>
  ) : hint ? (
    <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-faint">{hint}</span>
  ) : null

  if (group) {
    return (
      <div role="group" aria-labelledby={label ? labelId : undefined} className={cx('block', className)}>
        {label && (
          <span id={labelId} className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
            {label}
          </span>
        )}
        {children}
        {caption}
      </div>
    )
  }

  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>}
      {children}
      {caption}
    </label>
  )
}

export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function GlassInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cx('glass-field', className)} {...rest} />
  },
)

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GlassTextarea({ className, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cx('glass-field resize-y leading-relaxed', className)} {...rest} />
  },
)

export const GlassSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function GlassSelect({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cx('glass-field appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
    )
  },
)

/* ---------- Badge ---------- */

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/10 text-ink-soft border-ink/10',
  accent: 'bg-accent/15 text-accent border-accent/25',
  ok: 'bg-ok/15 text-ok border-ok/25',
  warn: 'bg-warn/15 text-warn border-warn/25',
  danger: 'bg-danger/15 text-danger border-danger/25',
  info: 'bg-info/15 text-info border-info/25',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-glass px-6 py-14 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink-soft">{title}</p>
      {hint && <p className="max-w-sm text-[13px] leading-relaxed text-ink-faint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------- Progress ring & bar ---------- */

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const fill: Record<Tone, string> = {
    neutral: 'bg-ink-soft',
    accent: 'bg-accent',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    info: 'bg-info',
  }
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-ink/10">
      <div
        className={cx('h-full rounded-pill transition-[width] duration-500 ease-out', fill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
