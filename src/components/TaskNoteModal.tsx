import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/lib/utils'
import { FONT_SIZES, HIGHLIGHT_COLORS, TEXT_COLORS, sanitizeStrict } from '@/lib/richtext'
import {
  BellIcon, CheckboxIcon, ImageIcon, MoreIcon,
  PaletteIcon, PinIcon, RedoIcon, UndoIcon, XIcon,
} from '@/components/icons'
import { GlassButton } from '@/components/glass/Glass'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { formatDateTime } from '@/lib/utils'

/**
 * Pop-up editor catatan/task ala Google Keep:
 * - Judul di atas + pin kanan
 * - Body rich text (utang format dari RichTextEditor) tanpa border
 * - Baris "Diedit …" lalu toolbar bawah: format (H1/H2/size/B/I/U/S),
 *   stabilo, palet warna, pengingat, kolaborator, gambar, kotak centang,
 *   menu lainnya, undo/redo, dan Tutup
 * - Auto-save tiap perubahan; Tutup hanya menutup.
 */

export interface TaskNoteDraft {
  title: string
  html: string
  pinned: boolean
  color: string | null
  dueDate: string | null
  archived: boolean
  /** Nama-nama kolaborator (sesama pengguna aplikasi). */
  collaborators?: string[]
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
  /** Lokasi task (project · building) — untuk panel kolaborator. */
  locationLabel?: string
}

export function TaskNoteModal({
  open, initial, editedAt, onChange, onClose, onArchive, onDelete, locationLabel,
}: TaskNoteModalProps) {
  const { t, lang } = useLang()
  const { data } = useData()
  const titleRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(initial)
  const [panel, setPanel] = useState<null | 'palette' | 'reminder' | 'more' | 'collab'>(null)
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, strike: false })
  const [size, setSize] = useState(14)
  const [empty, setEmpty] = useState(isEmptyHtml(initial.html))
  /* Lebar dialog bisa ditarik dari tepi kiri/kanan (px). */
  const [width, setWidth] = useState<number | null>(null)
  /* Tinggi dialog bisa ditarik dari tepi atas/bawah (px). */
  const [height, setHeight] = useState<number | null>(null)

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
      // Saat melayang (pinned), Escape sengaja diabaikan — tutup lewat tombol X.
      if (e.key === 'Escape' && !draft.pinned) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // draft.pinned disengaja: listener perlu mode terkini.
  }, [open, onClose, draft.pinned])

  if (!open) return null

  const patch = (part: Partial<TaskNoteDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...part }
      onChange(next)
      return next
    })
  }

  const savedRange = useRef<Range | null>(null)

  /** Simpan seleksi editor agar format tetap kena setelah klik toolbar. */
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

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

  /** Stabilo (marker) area teks terseleksi — beda dari warna latar kartu.
   *  Dipanggil lagi pada teks yang SAMA → stabilo hilang (toggle). */
  const applyHighlight = (hex: string) => {
    restoreSelection()
    const sel = window.getSelection()
    const el = editorRef.current
    if (sel && el && sel.rangeCount > 0 && !sel.isCollapsed) {
      // Deteksi: seluruh isi seleksi sudah di dalam <mark> berwarna sama?
      const range = sel.getRangeAt(0)
      const frag = range.cloneContents()
      const probe = document.createElement('div')
      probe.appendChild(frag)
      const marks = Array.from(probe.querySelectorAll('mark'))
      const fullyMarked =
        marks.length > 0 &&
        marks.every((m) => (m.getAttribute('data-bg') ?? m.style.backgroundColor).toLowerCase() === hex.toLowerCase()) &&
        probe.textContent === marks.map((m) => m.textContent).join('')

      if (fullyMarked) {
        // Toggle OFF: bungkus <mark> dalam seleksi jadi teks polos.
        const liveMarks = Array.from(el.querySelectorAll('mark')).filter((m) => range.intersectsNode(m))
        liveMarks.forEach((m) => {
          const parent = m.parentNode
          if (!parent) return
          while (m.firstChild) parent.insertBefore(m.firstChild, m)
          parent.removeChild(m)
          parent.normalize()
        })
        emitBody()
        return
      }
    }

    // Toggle ON: stabilo seleksi dengan warna.
    // Firefox tidak punya hiliteColor; styleWithCSS + bgColor jadi fallback.
    document.execCommand('styleWithCSS', false, 'false')
    const ok = document.execCommand('hiliteColor', false, hex)
    if (!ok) document.execCommand('backColor', false, hex)
    refreshFormat()
    emitBody()
  }

  /** Ganti blok baris saat ini menjadi H1/H2/paragraf.
   *  Bentuk '<h1>' (dengan kurung) paling kompatibel antar browser. */
  const applyBlock = (tag: 'h1' | 'h2' | 'p') => {
    restoreSelection()
    document.execCommand('formatBlock', false, `<${tag}>`)
    emitBody()
  }

  /** Cegah tombol toolbar merebut fokus dari editor — seleksi tetap hidup,
   *  jadi H1/H2/B/I/U/S/stabilo langsung kena teks yang diblok. */
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  /** Sisipkan gambar (base64) di posisi kursor; juga dipakai untuk paste. */
  const insertImage = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      restoreSelection()
      document.execCommand('insertHTML', false, `<img src="${reader.result}" alt="">`)
      emitBody()
    }
    reader.readAsDataURL(file)
  }

  const fileRef = useRef<HTMLInputElement>(null)

  const toolBtn = (active: boolean) =>
    cx(
      'grid h-9 w-9 place-items-center rounded-full transition-colors',
      active ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-black/5 dark:hover:bg-white/10',
    )

  /* Nama sesama pengguna aplikasi (untuk panel kolaborator). */
  const accounts = useMemo(
    () => data.members.map((m) => m.name).sort((a, b) => a.localeCompare(b)),
    [data.members],
  )



  const toggleCollab = (name: string) => {
    const list = draft.collaborators ?? []
    patch({ collaborators: list.includes(name) ? list.filter((x) => x !== name) : [...list, name] })
  }

  /* Mode melayang: dipicu pin. Popup kecil menempel di pojok, halaman tetap bisa dipakai. */
  const floating = draft.pinned

  /* Tarik tepi kiri/kanan dialog untuk melebarkan/mempersempit area input. */
  const startResize = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = (width ?? window.innerWidth < 640 ? window.innerWidth - 32 : 576)
    const dir = side === 'right' ? 1 : -1
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(window.innerWidth - 24, Math.max(floating ? 280 : 320, startW + dir * (ev.clientX - startX)))
      setWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /* Tarik tepi atas/bawah dialog untuk mengatur TINGGI area input. */
  const startResizeV = (e: React.PointerEvent<HTMLDivElement>, side: 'top' | 'bottom') => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = height ?? dialogRef.current?.offsetHeight ?? 480
    const onMove = (ev: PointerEvent) => {
      const delta = side === 'top' ? startY - ev.clientY : ev.clientY - startY
      setHeight(Math.min(Math.round(window.innerHeight * 0.9), Math.max(240, startH + delta)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={!floating}
      className={cx(
        'relative flex w-full flex-col rounded-2xl border bg-white shadow-2xl outline-none',
        floating
          ? 'border-black/10 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.45)] dark:border-white/15 dark:bg-[#1e2028]'
          : 'max-h-[88dvh] border-black/10 dark:border-white/15 dark:bg-[#1e2028]',
      )}
      style={{
        ...(draft.color ? { backgroundColor: draft.color } : null),
        width: floating ? (width ? `${width}px` : 'min(92vw, 430px)') : width ? `${width}px` : undefined,
        maxWidth: floating ? '92vw' : 'min(92vw, 1080px)',
        height: height ? `${height}px` : undefined,
        maxHeight: floating ? '72dvh' : '88dvh',
      }}
    >
      {/* ---------- handle resize: kiri/kanan (lebar) & atas/bawah (tinggi) ---------- */}
      <div
        onPointerDown={(e) => startResize(e, 'left')}
        className="absolute bottom-10 left-0 top-4 z-20 w-1.5 cursor-ew-resize touch-none rounded-full opacity-0 transition-opacity hover:opacity-100"
        aria-hidden="true"
      >
        <span className="absolute left-1 top-1/2 h-10 w-1 -translate-y-1/2 rounded-pill bg-ink/20" />
      </div>
      <div
        onPointerDown={(e) => startResize(e, 'right')}
        className="absolute bottom-10 right-0 top-4 z-20 w-1.5 cursor-ew-resize touch-none rounded-full opacity-0 transition-opacity hover:opacity-100"
        aria-hidden="true"
      >
        <span className="absolute right-1 top-1/2 h-10 w-1 -translate-y-1/2 rounded-pill bg-ink/20" />
      </div>
      <div
        onPointerDown={(e) => startResizeV(e, 'top')}
        className="absolute inset-x-4 top-0 z-20 h-1.5 cursor-ns-resize touch-none rounded-full opacity-0 transition-opacity hover:opacity-100"
        aria-hidden="true"
      >
        <span className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-pill bg-ink/20" />
      </div>
      <div
        onPointerDown={(e) => startResizeV(e, 'bottom')}
        className="absolute inset-x-4 bottom-0 z-20 h-1.5 cursor-ns-resize touch-none rounded-full opacity-0 transition-opacity hover:opacity-100"
        aria-hidden="true"
      >
        <span className="absolute bottom-1 left-1/2 h-1 w-10 -translate-x-1/2 rounded-pill bg-ink/20" />
      </div>
        {/* ---------- judul + pin + tutup ---------- */}
        <div className="flex items-center gap-1 px-5 pt-3">
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
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <XIcon className="h-[18px] w-[18px]" />
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
          onBlur={() => {
            saveSelection()
            emitBody()
          }}
          onMouseUp={() => {
            saveSelection()
            refreshFormat()
          }}
          onKeyUp={() => {
            saveSelection()
            refreshFormat()
          }}
          onPaste={(e) => {
            const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
            if (img) {
              e.preventDefault()
              insertImage(img)
            }
          }}
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
        <div className="relative flex flex-wrap items-center gap-0.5 px-3 pb-2 pt-1 safe-bottom">
          {/* Palet warna: warna teks + stabilo + latar kartu */}
          {panel === 'palette' && (
            <PopPanel wide onClose={() => setPanel(null)}>
              <div className="flex items-center gap-2 px-2 pt-1.5">
                <span className="text-[11px] font-semibold text-ink-faint">Teks</span>
                <div className="grid flex-1 grid-cols-6 gap-2">
                  {TEXT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`text ${hex}`}
                      onClick={() => applyColor(hex)}
                      className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 px-2 pt-2">
                <span className="text-[11px] font-semibold text-ink-faint">Stabilo</span>
                <div className="flex flex-1 items-center gap-2">
                  <button type="button" aria-label="marker none" onClick={() => applyHighlight('transparent')} className="h-6 w-6 rounded-full border border-black/15 bg-white dark:bg-[#1e2028]" />
                  {HIGHLIGHT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`marker ${hex}`}
                      onClick={() => applyHighlight(hex)}
                      className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              </div>
              <p className="px-2 pb-1 pt-2 text-[11px] text-ink-faint">Latar kartu</p>
              <div className="flex items-center gap-2 px-2 pb-1.5 pt-0">
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

          {/* Kolaborator: pilih sesama pengguna aplikasi */}
          {panel === 'collab' && (
            <PopPanel wide onClose={() => setPanel(null)}>
              {locationLabel && (
                <p className="border-b border-black/5 px-3 py-2 text-[11px] text-ink-faint dark:border-white/10">
                  {locationLabel}
                </p>
              )}
              <div className="max-h-56 overflow-y-auto">
                {accounts.map((name) => {
                  const on = (draft.collaborators ?? []).includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => toggleCollab(name)}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-pill bg-accent/20 text-[11px] font-extrabold text-accent">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate">{name}</span>
                      {on && <CheckIconSmall />}
                    </button>
                  )
                })}
                {accounts.length === 0 && (
                  <p className="px-3 py-3 text-[12.5px] text-ink-faint">{t('task.noCollaborators')}</p>
                )}
              </div>
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

          {/* Format inline langsung di toolbar: H1 H2 Aa | size | B I U S | stabilo */}
          <button type="button" title="Heading 1" onMouseDown={keepFocus} className={toolBtn(false) + ' text-[12px] font-extrabold'} onClick={() => applyBlock('h1')}>H1</button>
          <button type="button" title="Heading 2" onMouseDown={keepFocus} className={toolBtn(false) + ' text-[12px] font-extrabold'} onClick={() => applyBlock('h2')}>H2</button>
          <button type="button" title="Teks biasa" onMouseDown={keepFocus} className={toolBtn(false) + ' text-[12px] font-bold'} onClick={() => applyBlock('p')}>Aa</button>
          <select
            aria-label="font size"
            value={size}
            onChange={(e) => applySize(Number(e.target.value))}
            className="h-9 rounded-full bg-transparent px-1.5 text-[12px] font-semibold text-ink-soft hover:bg-black/5 focus:outline-none dark:hover:bg-white/10"
          >
            {FONT_SIZES.map((px) => (
              <option key={px} value={px}>{px}</option>
            ))}
          </select>
          <button type="button" aria-pressed={format.bold} title="Bold" onMouseDown={keepFocus} className={toolBtn(format.bold) + ' text-[14px] font-bold'} onClick={() => applyCmd('bold')}>B</button>
          <button type="button" aria-pressed={format.italic} title="Italic" onMouseDown={keepFocus} className={toolBtn(format.italic) + ' text-[14px] italic'} onClick={() => applyCmd('italic')}>I</button>
          <button type="button" aria-pressed={format.underline} title="Underline" onMouseDown={keepFocus} className={toolBtn(format.underline) + ' text-[14px] underline'} onClick={() => applyCmd('underline')}>U</button>
          <button type="button" aria-pressed={format.strike} title="Strikethrough" onMouseDown={keepFocus} className={toolBtn(format.strike) + ' text-[14px] line-through'} onClick={() => applyCmd('strikeThrough')}>S</button>
          <button
            type="button"
            title="Stabilo"
            onMouseDown={keepFocus}
            onClick={() => applyHighlight(HIGHLIGHT_COLORS[3])}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[4px] bg-[#fff173] text-[10px] font-extrabold text-[#7a6400]">S</span>
          </button>
          <button type="button" title="Palette" className={toolBtn(panel === 'palette')} onClick={() => setPanel(panel === 'palette' ? null : 'palette')}>
            <PaletteIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Reminder" className={toolBtn(panel === 'reminder')} onClick={() => setPanel(panel === 'reminder' ? null : 'reminder')}>
            <BellIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Collaborator" className={toolBtn(panel === 'collab')} onClick={() => setPanel(panel === 'collab' ? null : 'collab')}>
            <PersonAddIconSmall />
          </button>
          <button type="button" title="Image" className={toolBtn(false)} onClick={() => fileRef.current?.click()}>
            <ImageIcon className="h-[18px] w-[18px]" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) insertImage(f)
              e.target.value = ''
            }}
          />
          <button type="button" title="Checkbox" onMouseDown={keepFocus} className={toolBtn(false)} onClick={() => { restoreSelection(); document.execCommand('insertUnorderedList'); emitBody() }}>
            <CheckboxIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title={t('task.more')} className={toolBtn(panel === 'more')} onClick={() => setPanel(panel === 'more' ? null : 'more')}>
            <MoreIcon className="h-[18px] w-[18px]" />
          </button>
          <span className="mx-1 h-5 w-px bg-ink/10" />
          <button type="button" title="Undo" onMouseDown={keepFocus} className={toolBtn(false)} onClick={() => { document.execCommand('undo'); emitBody() }}>
            <UndoIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" title="Redo" onMouseDown={keepFocus} className={toolBtn(false)} onClick={() => { document.execCommand('redo'); emitBody() }}>
            <RedoIcon className="h-[18px] w-[18px]" />
          </button>
          <GlassButton variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            {t('common.close')}
          </GlassButton>
        </div>
    </div>
  )

  /* Pinned → popup melayang kecil di pojok kanan-bawah, tanpa backdrop gelap;
     halaman tetap bisa dipakai dan popup tetap tampil. */
  if (floating) {
    return createPortal(
      <div className="fixed bottom-4 right-4 z-[130]">{dialog}</div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 flex w-full justify-center">{dialog}</div>
    </div>,
    document.body,
  )
}

/** Panel kecil melayang di atas toolbar (palet / pengingat / menu). */
function PopPanel({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden="true" />
      <div className={cx('absolute bottom-14 left-2 z-30 rounded-2xl border border-black/10 bg-white py-1 shadow-2xl dark:border-white/15 dark:bg-[#2a2d36]', wide ? 'w-[300px]' : 'min-w-56')}>
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

function CheckIconSmall() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  )
}

function isEmptyHtml(html: string): boolean {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').trim() === '' && !el.querySelector('img')
}