import { type ReactNode } from 'react'
import { cx, inkStyleFor } from '@/lib/utils'
import { CheckIcon, PinIcon } from '@/components/icons'
import { RichText } from '@/components/RichText'

/**
 * Kartu catatan/task ala Google Keep: putih flat, sudut membulat,
 * hover/klik mengangkat kartu dan memunculkan ikon centang (kiri-atas)
 * serta pin (kanan-atas). Klik area mana pun membuka pop-up editor.
 */

interface NoteCardProps {
  title: string
  html: string
  done?: boolean
  pinned?: boolean
  /** Warna latar kartu (dari palet) — opsional. */
  color?: string
  meta?: ReactNode
  onToggleDone?: () => void
  onTogglePin?: () => void
  onOpen: () => void
}

export function NoteCard({
  title, html, done, pinned, color, meta,
  onToggleDone, onTogglePin, onOpen,
}: NoteCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      // Kartu berwarna memakai tinta yang kontras dengan warnanya sendiri,
      // bukan tinta tema (di tema gelap teks putih di atas kuning tak terbaca).
      style={color ? { backgroundColor: color, ...inkStyleFor(color) } : undefined}
      className={cx(
        'note-card group relative flex w-full cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left',
        'border-black/5 bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08)] outline-none',
        'transition-[transform,box-shadow] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]',
        'focus-visible:ring-2 focus-visible:ring-accent/50',
        'dark:border-white/10 dark:bg-glass-bg/25',
        done && 'opacity-70',
      )}
    >
      {/* Ikon muncul saat kartu disentuh (desktop) atau selalu (mobile). */}
      {onToggleDone && (
        <button
          type="button"
          aria-label="done"
          onClick={(e) => {
            e.stopPropagation()
            onToggleDone()
          }}
          className={cx(
            'absolute left-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full transition-all',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-60',
            done ? 'bg-ok text-white' : 'bg-black/5 text-ink-soft hover:bg-black/10 dark:bg-white/10 dark:text-ink',
          )}
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      )}

      {onTogglePin && (
        <button
          type="button"
          aria-label="pin"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
          className={cx(
            'absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full transition-all',
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-60',
            'bg-black/5 text-ink-soft hover:bg-black/10 dark:bg-white/10 dark:text-ink',
            pinned && 'text-accent',
          )}
        >
          <PinIcon className={cx('h-4 w-4', pinned && 'fill-current')} />
        </button>
      )}

      {title && (
        <h3
          className={cx(
            'break-words px-0 text-[14.5px] font-semibold leading-snug text-ink',
            (onToggleDone || onTogglePin) && 'px-8',
            done && 'line-through',
          )}
        >
          {title}
        </h3>
      )}

      {html && (
        <div className="min-h-0 flex-1 overflow-y-auto break-words text-[13px] leading-relaxed text-ink-soft [scrollbar-width:thin]">
          <RichText value={html} plainClassName="whitespace-pre-wrap" />
        </div>
      )}

      {meta && <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-ink-faint">{meta}</div>}
    </div>
  )
}
