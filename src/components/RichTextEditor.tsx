import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent,
} from 'react'
import { cx } from '@/lib/utils'
import { FONT_SIZES, TEXT_COLORS, sanitizeStrict } from '@/lib/richtext'

/**
 * Editor teks bergaya buku tulis: contentEditable + toolbar format
 * (ukuran huruf, palet warna, bold, italic, underline, strikethrough).
 *
 * Isinya HTML kecil yang selalu lolos sanitizeStrict — value yang keluar
 * sudah bersih, dan tidak ada event handler yang ikut tersimpan.
 */

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** Data-testid / aria-label dasar. */
  ariaLabel?: string
}

export function RichTextEditor({ value, onChange, placeholder, ariaLabel }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<number>(14)
  const [colorOpen, setColorOpen] = useState(false)
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, strike: false })
  const [empty, setEmpty] = useState(isEmptyHtml(value))

  // Nilai dari luar hanya masuk kalau editor tidak sedang fokus (mis. setelah
  // restore Drive) supaya kursor tidak dilompatkan saat mengetik.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (sanitizeStrict(el.innerHTML) !== sanitizeStrict(value)) {
      el.innerHTML = value
      setEmpty(isEmptyHtml(value))
    }
  }, [value])

  const emit = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const next = sanitizeStrict(el.innerHTML)
    setEmpty(isEmptyHtml(next))
    onChange(next)
  }, [onChange])

  /** Bungkus perubahan format + sinkron toolbar + emit dalam satu tempat. */
  const apply = (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') => {
    document.execCommand(cmd)
    refreshFormat()
    emit()
  }

  const refreshFormat = () => {
    setFormat({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
    })
  }

  /** Simpan seleksi sebelum menyentuh dropdown, lalu pulihkan saat memakai. */
  const savedRange = useRef<Range | null>(null)
  const keepSelection = () => {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
  }
  const restoreSelection = () => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    if (savedRange.current) sel.addRange(savedRange.current)
  }

  const setSizeAndApply = (px: number) => {
    setSize(px)
    restoreSelection()
    document.execCommand('fontSize', false, '7')
    // execCommand fontSize memakai <font size="7"> — konversi ke span ber-px.
    const el = editorRef.current
    if (el) {
      el.querySelectorAll('font[size="7"]').forEach((font) => {
        const span = document.createElement('span')
        span.setAttribute('style', `font-size:${px}px`)
        span.innerHTML = font.innerHTML
        font.replaceWith(span)
      })
      emit()
    }
  }

  const setColorAndApply = (hex: string) => {
    setColorOpen(false)
    restoreSelection()
    document.execCommand('foreColor', false, hex)
    refreshFormat()
    emit()
  }

  // Placeholder: tampilkan saat kosong.
  const onInput = () => {
    refreshFormat()
    emit()
  }

  // Enter: baris baru biasa; Ctrl/Cmd+B/I/U tetap berjalan lewat keymap bawaan
  // lalu kita sinkronkan indikatornya.
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      // Biarkan default jalan, sinkron indikator setelahnya.
      setTimeout(() => {
        refreshFormat()
        emit()
      }, 0)
    }
  }

  const editorStyle: CSSProperties = { fontSize: `${size}px` }

  return (
    <div className="glass-field relative !p-0">
      {/* ---------- toolbar ---------- */}
      <div className="flex flex-wrap items-center gap-1 border-b hairline px-2 py-1.5">
        <select
          aria-label={ariaLabel ? `${ariaLabel} size` : 'font size'}
          value={size}
          onMouseDown={keepSelection}
          onChange={(e) => setSizeAndApply(Number(e.target.value))}
          className="h-7 rounded-lg border-0 bg-transparent pr-1 text-[12px] font-semibold text-ink-soft focus:outline-none"
        >
          {FONT_SIZES.map((px) => (
            <option key={px} value={px}>{px}</option>
          ))}
        </select>

        <ToolButton active={format.bold} onClick={() => apply('bold')} title="Bold" label={<b>B</b>} />
        <ToolButton active={format.italic} onClick={() => apply('italic')} title="Italic" label={<i>I</i>} />
        <ToolButton active={format.underline} onClick={() => apply('underline')} title="Underline" label={<u>U</u>} />
        <ToolButton active={format.strike} onClick={() => apply('strikeThrough')} title="Strikethrough" label={<s>S</s>} />

        <span className="mx-1 h-5 w-px bg-ink/10" />

        {/* Palet warna */}
        <div className="relative">
          <button
            type="button"
            title="Color"
            aria-label="Text color"
            onMouseDown={keepSelection}
            onClick={() => setColorOpen((v) => !v)}
            className="grid h-7 w-8 place-items-center rounded-lg hover:bg-glass-bg/30"
          >
            <span
              className="block h-4 w-4 rounded-full border border-ink/20 shadow-inner"
              style={{ background: 'conic-gradient(#e23e3e, #e09614, #28a868, #0a84ff, #7c3aed, #e23e3e)' }}
            />
          </button>
          {colorOpen && (
            <>
              {/* Klik di luar menutup palet. */}
              <div className="fixed inset-0 z-30" onClick={() => setColorOpen(false)} />
              <div className="absolute left-0 top-9 z-40 grid grid-cols-4 gap-1.5 rounded-2xl border glass glass-strong p-2.5 shadow-xl">
                {TEXT_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={hex}
                    onClick={() => setColorAndApply(hex)}
                    className="h-6 w-6 rounded-full border border-ink/15 transition-transform hover:scale-110"
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- area tulis ---------- */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          style={{ ...editorStyle, minHeight: '7rem' }}
          className="rich-editor max-h-[60dvh] overflow-y-auto px-4 py-3 leading-loose outline-none"
          data-placeholder={placeholder}
          onInput={onInput}
          onBlur={emit}
          onKeyDown={onKeyDown}
          onMouseUp={refreshFormat}
          onKeyUp={refreshFormat}
        />
        {empty && (
          <p className="pointer-events-none absolute left-4 top-3 text-[14px] text-ink-faint">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  active, onClick, title, label,
}: {
  active: boolean
  onClick: () => void
  title: string
  label: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault() /* jaga seleksi teks */}
      onClick={onClick}
      className={cx(
        'grid h-7 w-7 place-items-center rounded-lg text-[13px] transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-glass-bg/30',
      )}
    >
      {label}
    </button>
  )
}

/** Kosong berarti tak ada teks sama sekali (boleh ada <br> sisa Enter). */
function isEmptyHtml(html: string): boolean {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').trim() === '' && !el.querySelector('img')
}
