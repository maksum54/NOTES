import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import { useLang } from '@/context/LangContext'
import { ExpandIcon, XIcon } from '@/components/icons'
import type { CanvasScene } from '@/types'

/* ============================================================
   CANVAS Excalidraw (https://github.com/excalidraw/excalidraw)
   Tertanam langsung di halaman task — bukan modal.
   Fitur bawaan Excalidraw: pena, bentuk, panah, teks, sticky
   note, undo/redo, dan paste gambar ke canvas (Ctrl+V).
   Ditambah: tombol FULL SCREEN (overlay app-level — tidak keluar
   sendiri saat Esc/sentuhan; hanya tombol TUTUP yang mengakhiri).
   ============================================================ */

/** Scene disimpan sebagai CanvasScene pada task.canvas. */
export type BoardScene = CanvasScene

/** Serialize file Excalidraw ke bentuk simpanan ringkas. */
function serializeFiles(files: BinaryFiles | null): CanvasScene['files'] {
  if (!files) return undefined
  return Object.fromEntries(
    Object.entries(files).map(([id, f]) => [
      id,
      { id: f.id, dataURL: f.dataURL, mimeType: f.mimeType, created: f.created },
    ]),
  )
}

/** Satu instance Excalidraw yang dipakai bareng mode normal & fullscreen. */
function CanvasInstance({
  onReady,
  onChange,
}: {
  onReady: (api: ExcalidrawImperativeAPI) => void
  onChange: (els: readonly ExcalidrawElement[], _appState: unknown, fs: BinaryFiles) => void
}) {
  const { lang } = useLang()
  return (
    <Excalidraw
      excalidrawAPI={onReady}
      langCode={lang === 'id' ? 'id' : 'en'}
      theme="light"
      onChange={onChange}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: true,
          clearCanvas: false,
        },
      }}
    />
  )
}

/**
 * Canvas Excalidraw tertanam. onChange langsung diteruskan ke onSave
 * (di-debounce di pemanggil), jadi tidak ada tombol simpan manual.
 * `fullScreen` adalah overlay app-level: menutup seluruh halaman dan
 * HANYA bisa ditutup lewat tombol Tutup (Esc diabaikan sengaja).
 */
export function ExcalidrawCanvas({
  scene,
  onSave,
}: {
  scene: CanvasScene | null | undefined
  onSave: (scene: CanvasScene) => void
}) {
  const { t } = useLang()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [ready, setReady] = useState(false)
  const [isFull, setIsFull] = useState(false)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  const handleChange = useCallback(
    (els: readonly ExcalidrawElement[], _: unknown, fs: BinaryFiles) => {
      saveRef.current({ elements: els as unknown[], files: serializeFiles(fs) })
    },
    [],
  )

  const handleReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
    setReady(true)
  }, [])

  // Kirim scene tersimpan ke API begitu editor siap (sekali per mount).
  useEffect(() => {
    if (!ready || !apiRef.current) return
    const initial: CanvasScene = scene ?? { elements: [] }
    if (initial.elements.length > 0 || (initial.files && Object.keys(initial.files).length > 0)) {
      apiRef.current.updateScene({
        elements: initial.elements as ExcalidrawElement[],
      })
      if (initial.files) {
        apiRef.current.addFiles(
          Object.values(initial.files).map((f) => ({
            id: f.id,
            dataURL: f.dataURL,
            mimeType: f.mimeType,
            created: f.created,
            lastRetrieved: f.created,
          })) as never,
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Esc sengaja DIABAIKAN di mode fullscreen — hanya tombol Tutup yang menutup.
  useEffect(() => {
    if (!isFull) return
    const stop = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation()
    }
    document.addEventListener('keydown', stop, true)
    return () => document.removeEventListener('keydown', stop, true)
  }, [isFull])

  const canvas = (
    <CanvasInstance onReady={handleReady} onChange={handleChange} />
  )

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border hairline" style={{ height: '68dvh' }}>
        {canvas}
      </div>

      {/* Tombol full screen mengambang di pojok kanan atas canvas. */}
      <button
        type="button"
        onClick={() => setIsFull(true)}
        title={t('board.fullscreen')}
        aria-label={t('board.fullscreen')}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-ink-soft shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white hover:text-ink"
      >
        <ExpandIcon className="h-[18px] w-[18px]" />
      </button>

      {/* ---------- FULL SCREEN: overlay seluruh halaman ---------- */}
      {isFull &&
        createPortal(
          <div className="fixed inset-0 z-[120] bg-white" role="dialog" aria-modal="true">
            <canvas className="absolute inset-0" />
            {/* Tombol Tutup — satu-satunya cara keluar mode full screen. */}
            <button
              type="button"
              onClick={() => setIsFull(false)}
              className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-xl bg-ink/80 px-3.5 py-2 text-[13px] font-bold text-white shadow-lg backdrop-blur transition-colors hover:bg-ink"
            >
              <XIcon className="h-4 w-4" />
              {t('common.close')}
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

export type { ExcalidrawImperativeAPI }
