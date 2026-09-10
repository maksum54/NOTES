import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import { useLang } from '@/context/LangContext'
import { ExpandIcon, ShrinkIcon } from '@/components/icons'
import type { CanvasScene } from '@/types'

/* ============================================================
   CANVAS Excalidraw (https://github.com/excalidraw/excalidraw)
   Tertanam langsung di halaman task — bukan modal.
   Fitur bawaan Excalidraw: pena, bentuk, panah, teks, sticky
   note, undo/redo, dan paste gambar ke canvas (Ctrl+V).
   Ditambah: tombol FULL SCREEN.
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

/**
 * Canvas Excalidraw tertanam. onChange langsung diteruskan ke onSave
 * (di-debounce di pemanggil), jadi tidak ada tombol simpan manual.
 * `fullScreen` memakai Fullscreen API browser — canvas mengisi seluruh layar.
 */
export function ExcalidrawCanvas({
  scene,
  onSave,
}: {
  scene: CanvasScene | null | undefined
  onSave: (scene: CanvasScene) => void
}) {
  const { t, lang } = useLang()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // Ikuti perubahan fullscreen yang dipicu dari luar (mis. tombol Esc).
  useEffect(() => {
    const onFsChange = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullScreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen().catch(() => {
        // Browser menolak (mis. tanpa gesture) — abaikan.
      })
    }
  }, [])

  return (
    <div className="relative">
      {/* Tombol full screen mengambang di pojok kanan atas canvas.
          Z-index di atas toolbar Excalidraw. */}
      <button
        type="button"
        onClick={toggleFullScreen}
        title={isFull ? t('board.exitFullscreen') : t('board.fullscreen')}
        aria-label={isFull ? t('board.exitFullscreen') : t('board.fullscreen')}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-ink-soft shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white hover:text-ink"
      >
        {isFull ? <ShrinkIcon className="h-[18px] w-[18px]" /> : <ExpandIcon className="h-[18px] w-[18px]" />}
      </button>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl border hairline"
        style={{ height: isFull ? undefined : '68dvh' }}
      >
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
            setReady(true)
          }}
          langCode={lang === 'id' ? 'id' : 'en'}
          theme="light"
          onChange={handleChange}
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
      </div>
    </div>
  )
}

export type { ExcalidrawImperativeAPI }
