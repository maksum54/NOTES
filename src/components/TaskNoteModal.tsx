import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/lib/utils'
import { FONT_SIZES, TEXT_COLORS, sanitizeStrict } from '@/lib/richtext'
import {
  BellIcon, CheckboxIcon, FormatIcon, ImageIcon, MoreIcon,
  PaletteIcon, PinIcon, RedoIcon, UndoIcon,
} from '@/components/icons'
import { GlassButton } from '@/components/glass/Glass'
import { useLang } from '@/context/LangContext'
import { formatDateTime } from '@/lib/utils'

/**
 * Pop-up editor catatan/task ala Google Keep:
 * - Judul di atas + pin kanan
 * - Body rich text (utang format dari RichTextEditor) tanpa border
 * - Baris "Diedit …" lalu toolbar bawah: format, palet warna, pengingat,
 *   gambar, kotak centang, menu lainnya, undo/redo, dan Tutup
 * - Auto-save tiap perubahan; Tutup hanya menutup.
 */

export interface TaskNoteDraft {
  title: string
  html: string
  pinned: boolean
  color: string | null
  dueDate: string | null
  archived: boolean
}

interface TaskNoteModalProps {
  open: boolean
  initial: TaskNoteDraft
  /** Stempel waktu terakhir diedit (ISO) untuk baris "Diedit 21.31". */
  editedAt?: string | null
  onChange: (draft: TaskNoteDraft) => void
  onClose: () => void
  onArchive?: () => void
  onDelete?: () => void
}

export function TaskNoteModal({
  open, initial, editedAt, onChange, onClose, onArchive, onDelete,
}: TaskNoteModalProps) {
  const { t, lang } = useLang()
  const titleRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(initial)
  const [panel, setPanel] = useState<null | 'palette' | 'reminder' | 'format' | 'more'>(null)
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, strike: false })
  const [size, setSize] = useState(14)
  const [empty, setEmpty] = useState(isEmptyHtml(initial.html))

  // Nilai masuk saat modal dibuka (bukan tiap render, agar kursor stabil).
  useEffect(() => {
    if (!open) return
    setDraft(initial)
    setEmpty(isEmptyHtml(initial.html))
    if (editorRef.current) editorRef.current.innerHTML = initial.html
    const timer = setTimeout(() => titleRef.current?.focus(), 30)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const patch = (part: Partial<TaskNoteDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...part }
      onChange(next)
      return next
    })
  }

  const savedRange = useRef<Range | null>(null)
  const restoreSelection = () => {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    if (savedRange.current) sel.addRange(savedRange.current)
  }

  const emitBody = () => {
    const el = editorRef.current
    if (!el) return
    const html = sanitizeStrict(el.innerHTML)
    setEmpty(isEmptyHtml(html))
    patch({ html })
  }

  const refreshFormat = () =>
    setFormat({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
    })

  const applyCmd = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    document.execCommand(cmd)
    refreshFormat()
    emitBody()
  }

  const applySize = (px: number) => {
    setSize(px)
    restoreSelection()
    document.execCommand('fontSize', false, '7')
    const el = editorRef.current
    if (el) {
      el.querySelectorAll('font[size="7"]').forEach((font) => {
        const span = document.createElement('span')
        span.setAttribute('style', `font-size:${px}px`)
        span.innerHTML = font.innerHTML
        font.replaceWith(span)
      })
      emitBody()
    }
  }

  const applyColor = (hex: string) => {
    restoreSelection()
    document.execCommand('foreColor', false, hex)
    refreshFormat()
    emitBody()
  }

  const toolBtn = (active: boolean) =>
    cx(
      'grid h-9 w-9 place-items-center rounded-full transition-colors',
      active ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-black/5 dark:hover:bg-white/10',
    )

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative z-10 flex max-h-[88dvh] w-full max-w-xl flex-col rounded-2xl border border-black/10 bg-white shadow-2xl outline-none',
          'dark:border-white/15 dark:bg-[#1e2028]',
        )}
        style={draft.color ? { backgroundColor: draft.color } : undefined}
      >
        {/* ---------- judul + pin ---------- */}
        <div className="flex items-center gap-2 px-5 pt-4">
          <input
            ref={titleRef}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={t('task.titleLabel')}
            className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            aria-label={draft.pinned ? t('task.unpin') : t('task.pin')}
            onClick={() => patch({ pinned: !draft.pinned })}
            className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10', draft.pinned && 'text-accent')}
          >
            <PinIcon className={cx('h-[18px] w-[18px]', draft.pinned && 'fill-current')} />
          </button>
        </div>

        {/* ---------- body ---------- */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={t('task.descriptionPlaceholder')}
          className="rich-editor min-h-[7rem] flex-1 overflow-y-auto px-5 py-3 text-[14px] leading-relaxed text-ink outline-none"
          style={{ fontSize: `${size}px` }}
          onInput={() => {
            refreshFormat()
            emitBody()
          }}
          onBlur={emitBody}
          onMouseUp={refreshFormat}
          onKeyUp={refreshFormat}
        />
        {empty && (
          <p className="pointer-events-none -mt-[calc(7rem-0.75rem)] px-5 py-3 text-[14px] text-ink-faint">
            {t('task.descriptionPlaceholder')}
          </p>
        )}

        {/* ---------- diedit + pengingat aktif ---------- */}
        <div className="flex items-center justify-between px-5 pb-1 text-[11px] text-ink-faint">
          <span>
            {draft.dueDate && (
              <span className="mr-2 inline-flex items-center gap-1 rounded-pill bg-black/5 px-2 py-0.5 dark:bg-white/10">
                <BellIcon className="h-3 w-3" />
                {formatDateTime(draft.dueDate, lang)}
              </span>
            )}
          </span>
          {editedAt && <span>{t('task.editedAt', { time: formatDateTime(editedAt, lang) })}</span>}
        </div>

        {/* ---------- toolbar bawah ---------- */}
        <div className="relative flex items-center gap-0.5 px-3 pb-2 pt-1 safe-bottom">
          {/* Format: H1 / H2 / Aa / ukuran / B / I / U / S */}
          {panel === 'format' && (
            <PopPanel onClose={() => setPanel(null)}>
              <div className="flex items-center gap-0.5">
                {[
                  { label: 'H1', cmd: () => document.execCommand('formatBlock', false, 'h1') },
                  { label: 'H2', cmd: () => document.execCommand('formatBlock', false, 'h2') },
                  { label: 'Aa', cmd: () => document.execCommand('formatBlock', false, 'p') },
                ].map((b) => (
                  <button key={b.label} type="button" className={toolBtn(false) + ' text-[13px] font-bold'} onClick={() => { restoreSelection(); b.cmd(); emitBody() }}>
                    {b.label}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-ink/10" />
                <select
                  aria-label="font size"
                  value={size}
                  onChange={(e) => applySize(Number(e.target.value))}
                  className="h-8 rounded-lg bg-transparent pr-1 text-[12px] font-semibold text-ink-soft focus:outline-none"
                >
                  {FONT_SIZES.map((px) => (
                    <option key={px} value={px}>{px}</option>
                  ))}
                </select>
                <span className="mx-1 h-5 w-px bg-ink/10" />
                <button type="button" aria-pressed={format.bold} className={toolBtn(format.bold) + ' text-[14px] font-bold'} onClick={() => applyCmd('bold')}>B</button>
                <button type="button" aria-pressed={format.italic} className={toolBtn(format.italic) + ' text-[14px] italic'} onClick={() => applyCmd('italic')}>I</button>
                <button type="button" aria-pressed={format.underline} className={toolBtn(format.underline) + ' text-[14px] underline'} onClick={() => applyCmd('underline')}>U</button>
                <button type="button" aria-pressed={format.strike} className={toolBtn(format.strike) + ' text-[14px] line-through'} onClick={() => applyCmd('strikeThrough')}>S</button>
              </div>
            </PopPanel>
          )}

          {/* Palet warna */}
          {panel === 'palette' && (
            <PopPanel onClose={() => setPanel(null)}>
              <div className="grid grid-cols-6 gap-2 p-1">
                {TEXT_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={hex}
                    onClick={() => applyColor(hex)}
                    className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                    style={{ background: hex }}
                  />
                ))}
              </div>
              <p className="px-2 pb-1 pt-1.5 text-[11px] text-ink-faint">Latar kartu</p>
              <div className="flex items-center gap-2 p-1 pt-0">
                <button type="button" aria-label="none" onClick={() => patch({ color: null })} className="h-6 w-6 rounded-full border border-black/15 bg-white dark:bg-[#1e2028]" />
                {['#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb', '#fdcfe8'].map((hex) => (
                  <button key={hex} type="button" aria-label={hex} onClick={() => patch({ color: hex })} className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110" style={{ background: hex }} />
                ))}
              </div>
            </PopPanel>
          )}

          {/* Pengingat */}
          {panel === 'reminder' && (
            <PopPanel onClose={() => setPanel(null)}>
              <button type="button" className="block w-full px-3 py-2.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { patch({ dueDate: null }); setPanel(null) }}>
                {t('task.reminderNone')}
              </button>
              <button type="button" className="block w-full px-3 py-2.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { patch({ dueDate: new Date().toISOString() }); setPanel(null) }}>
                {t('common.today')}
              </button>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-black/5 dark:hover:bg-white/10">
                {t('task.reminderPick')}
                <input
                  type="datetime-local"
                  className="ml-auto rounded-lg bg-black/5 px-2 py-1 text-[12px] dark:bg-white/10"
                  onChange={(e) => {
                    if (e.target.value) patch({ dueDate: new Date(e.target.value).toISOString() })
                    setPanel(null)
                  }}
                />
              </label>
            </PopPanel>
          )}

          {/* Menu lainnya */}
          {panel === 'more' && (
            <PopPanel onClose={() => setPanel(null)}>
              {onArchive && (
                <button type="button" className="block w-full px-3 py-2.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { patch({ archived: true }); onArchive(); setPanel(null); onClose() }}>
                  {t('task.archiveFromEditor')}
                </button>
              )}
              {onDelete && (
                <button type="button" className="block w-full px-3 py-2.5 text-left text-[13px] text-danger hover:bg-danger/10" onClick={() => { setPanel(null); onClose(); onDelete() }}>
                  {t('task.deleteFromEditor')}
                </button>
              )}
            </PopPanel>
          )}

          <button type="button" title="Format" className={toolBtn(panel === 'format')} onClick={() => setPanel(panel === 'format' ? null : 'format')}>
            <FormatIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Palette" className={toolBtn(panel === 'palette')} onClick={() => setPanel(panel === 'palette' ? null : 'palette')}>
            <PaletteIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Reminder" className={toolBtn(panel === 'reminder')} onClick={() => setPanel(panel === 'reminder' ? null : 'reminder')}>
            <BellIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Collaborator" className={toolBtn(false)} onClick={() => {}}>
            <PersonAddIconSmall />
          </button>
          <button type="button" title="Image" className={toolBtn(false)} onClick={() => {}}>
            <ImageIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Checkbox" className={toolBtn(false)} onClick={() => { restoreSelection(); document.execCommand('insertUnorderedList'); emitBody() }}>
            <CheckboxIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title={t('task.more')} className={toolBtn(panel === 'more')} onClick={() => setPanel(panel === 'more' ? null : 'more')}>
            <MoreIcon className="h-[18px] w-[18px]" />
          </button>
          <span className="mx-1 h-5 w-px bg-ink/10" />
          <button type="button" title="Undo" className={toolBtn(false)} onClick={() => { document.execCommand('undo'); emitBody() }}>
            <UndoIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Redo" className={toolBtn(false)} onClick={() => { document.execCommand('redo'); emitBody() }}>
            <RedoIcon className="h-[18px] w-[18px]" />
          </button>
          <GlassButton variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            {t('common.close')}
          </GlassButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Panel kecil melayang di atas toolbar (palet / pengingat / menu). */
function PopPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-14 left-2 z-30 min-w-56 rounded-2xl border border-black/10 bg-white py-1 shadow-2xl dark:border-white/15 dark:bg-[#2a2d36]">
        {children}
      </div>
    </>
  )
}

function PersonAddIconSmall() {
  // Inline agar tidak menambah import ikon baru di tiap pemakaian.
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  )
}

function isEmptyHtml(html: string): boolean {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').trim() === '' && !el.querySelector('img')
}