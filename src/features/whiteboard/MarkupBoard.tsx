import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, Stroke, TaskImage } from '@/types'
import { cx, uid } from '@/lib/utils'
import { useLang } from '@/context/LangContext'
import { GlassButton } from '@/components/glass/Glass'
import { Modal } from '@/components/glass/Modal'
import { EraserIcon, HighlighterIcon, PenIcon, TextIcon, TrashIcon, UndoIcon } from '@/components/icons'

/* ============================================================
   "BISA KASIH CORETAN DI GAMBAR SEPERTI PAPAN TULIS"

   Semua titik disimpan ternormalisasi 0..1 terhadap ukuran gambar,
   jadi coretan tetap pas di posisinya pada layar HP maupun PC.
   ============================================================ */

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text'

const PALETTE = ['#ff3b30', '#ff9f0a', '#ffd60a', '#32d74b', '#0a84ff', '#bf5af2', '#ffffff', '#1c1c1e']
const WIDTHS = [2, 4, 7, 12]

export function MarkupBoard({
  open,
  image,
  onClose,
  onSave,
}: {
  open: boolean
  image: TaskImage | null
  onClose: () => void
  onSave: (patch: { strokes: Stroke[]; annotations: Annotation[] }) => void
}) {
  const { t } = useLang()
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(PALETTE[0])
  const [width, setWidth] = useState(4)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [drawing, setDrawing] = useState<Stroke | null>(null)

  const surfaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !image) return
    setStrokes(image.strokes ?? [])
    setAnnotations(image.annotations ?? [])
    setDrawing(null)
  }, [open, image])

  /** Koordinat pointer -> 0..1 relatif kotak gambar. */
  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }, [])

  /** Buang goresan yang tersentuh penghapus (radius kecil di sekitar titik). */
  const eraseAt = useCallback((p: { x: number; y: number }) => {
    const R = 0.025
    setStrokes((prev) =>
      prev.filter(
        (s) => !s.points.some((pt) => Math.abs(pt.x - p.x) < R && Math.abs(pt.y - p.y) < R),
      ),
    )
    setAnnotations((prev) =>
      prev.filter((a) => Math.abs(a.x - p.x) > R * 2 || Math.abs(a.y - p.y) > R * 2),
    )
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const p = toLocal(e)
      if (!p) return
      e.currentTarget.setPointerCapture(e.pointerId)

      if (tool === 'eraser') {
        eraseAt(p)
        setDrawing({ id: 'erasing', points: [], color, width, tool: 'pen' })
        return
      }
      if (tool === 'text') {
        const text = window.prompt(t('board.textPrompt'))
        if (text?.trim()) {
          setAnnotations((prev) => [...prev, { id: uid('ann'), x: p.x, y: p.y, text: text.trim(), color }])
        }
        return
      }
      setDrawing({ id: uid('stk'), points: [p], color, width, tool })
    },
    [tool, color, width, toLocal, eraseAt, t],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drawing) return
      const p = toLocal(e)
      if (!p) return
      if (tool === 'eraser') {
        eraseAt(p)
        return
      }
      setDrawing((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev))
    },
    [drawing, tool, toLocal, eraseAt],
  )

  const onPointerUp = useCallback(() => {
    if (!drawing) return
    if (tool !== 'eraser' && drawing.points.length > 1) {
      setStrokes((prev) => [...prev, drawing])
    }
    setDrawing(null)
  }, [drawing, tool])

  const undo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1))
  }, [])

  const clearAll = useCallback(() => {
    setStrokes([])
    setAnnotations([])
  }, [])

  const visibleStrokes = useMemo(
    () => (drawing && tool !== 'eraser' ? [...strokes, drawing] : strokes),
    [strokes, drawing, tool],
  )

  if (!image) return null

  const tools: { id: Tool; label: string; icon: JSX.Element }[] = [
    { id: 'pen', label: t('board.pen'), icon: <PenIcon className="h-[18px] w-[18px]" /> },
    { id: 'highlighter', label: t('board.highlighter'), icon: <HighlighterIcon className="h-[18px] w-[18px]" /> },
    { id: 'text', label: t('board.text'), icon: <TextIcon className="h-[18px] w-[18px]" /> },
    { id: 'eraser', label: t('board.eraser'), icon: <EraserIcon className="h-[18px] w-[18px]" /> },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('board.title')}
      subtitle={t('board.hint')}
      size="full"
      footer={
        <>
          <GlassButton variant="ghost" onClick={undo} icon={<UndoIcon className="h-4 w-4" />}>
            {t('board.undo')}
          </GlassButton>
          <GlassButton variant="ghost" onClick={clearAll} icon={<TrashIcon className="h-4 w-4" />}>
            {t('board.clear')}
          </GlassButton>
          <div className="flex-1" />
          <GlassButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={() => {
              onSave({ strokes, annotations })
              onClose()
            }}
          >
            {t('board.saveBoard')}
          </GlassButton>
        </>
      }
    >
      <div className="space-y-3">
        {/* --- toolbar --- */}
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-2.5">
          <div className="flex gap-1">
            {tools.map((tl) => (
              <button
                key={tl.id}
                type="button"
                title={tl.label}
                aria-label={tl.label}
                aria-pressed={tool === tl.id}
                onClick={() => setTool(tl.id)}
                className={cx(
                  'grid h-9 w-9 place-items-center rounded-xl transition-all',
                  tool === tl.id
                    ? 'bg-accent text-white shadow-[0_4px_14px_-4px_rgb(var(--accent)/0.8)]'
                    : 'text-ink-soft hover:bg-glass-bg/25 hover:text-ink',
                )}
              >
                {tl.icon}
              </button>
            ))}
          </div>

          <span className="h-6 w-px bg-ink/15" />

          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${t('board.color')} ${c}`}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={cx(
                  'h-6 w-6 rounded-pill ring-1 ring-inset ring-black/20 transition-transform',
                  color === c ? 'scale-110 ring-2 ring-accent' : 'hover:scale-105',
                )}
              />
            ))}
          </div>

          <span className="h-6 w-px bg-ink/15" />

          <div className="flex items-center gap-1.5">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`${t('board.size')} ${w}`}
                onClick={() => setWidth(w)}
                className={cx(
                  'grid h-8 w-8 place-items-center rounded-xl transition-colors',
                  width === w ? 'bg-glass-bg/40 text-ink' : 'text-ink-faint hover:text-ink',
                )}
              >
                <span
                  className="rounded-pill bg-current"
                  style={{ width: w + 4, height: w + 4 }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* --- kanvas --- */}
        <div className="glass overflow-hidden rounded-glass p-2">
          <div
            ref={surfaceRef}
            className={cx(
              'relative w-full touch-none select-none overflow-hidden rounded-2xl bg-black/20',
              tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair',
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <img
              src={image.dataUrl}
              alt={image.name}
              draggable={false}
              className="pointer-events-none block w-full select-none"
            />
            <StrokeLayer strokes={visibleStrokes} />
            {annotations.map((a) => (
              <span
                key={a.id}
                style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color }}
                className="pointer-events-none absolute -translate-y-1/2 whitespace-pre rounded-lg bg-black/45 px-1.5 py-0.5 text-[13px] font-bold drop-shadow"
              >
                {a.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Render goresan sebagai SVG overlay dengan viewBox 0..100 (persen). */
export function StrokeLayer({ strokes }: { strokes: Stroke[] }) {
  if (strokes.length === 0) return null
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {strokes.map((s) => (
        <polyline
          key={s.id}
          points={s.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width / 6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={s.tool === 'highlighter' ? 0.42 : 1}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: s.width }}
        />
      ))}
    </svg>
  )
}
