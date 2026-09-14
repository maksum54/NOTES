import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types/types'
import { useLang } from '@/context/LangContext'
import { cx } from '@/lib/utils'
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

/**
 * Scene tersimpan -> `initialData` Excalidraw.
 *
 * Excalidraw memasang isi ini SENDIRI di dalam initializeScene()-nya. Itu satu-
 * satunya cara yang aman: memanggil updateScene() dari luar sesudah mount
 * kalah balapan dengan initializeScene(), yang menutup dengan
 * replaceAllElements([]) + isLoading=false — onChange lalu menyimpan kanvas
 * kosong dan coretan yang tersimpan terhapus.
 *
 * `scrollToContent` menggantikan fit-to-content manual: Excalidraw memusatkan
 * isi tepat setelah scene-nya siap, bukan lewat timer yang bisa keburu.
 */
function toInitialData(scene: CanvasScene | null | undefined): ExcalidrawInitialDataState | null {
  if (!scene) return null
  // `mimeType` disimpan sebagai string bebas; Excalidraw mengetikkannya
  // sebagai union — bentuknya sama, isinya memang keluaran Excalidraw sendiri.
  const files = scene.files
    ? (Object.fromEntries(
        Object.entries(scene.files).map(([id, f]) => [id, { ...f, lastRetrieved: f.created }]),
      ) as BinaryFiles)
    : undefined
  if (scene.elements.length === 0 && !files) return null
  return {
    elements: scene.elements as ExcalidrawElement[],
    files,
    scrollToContent: true,
  }
}

/** Satu instance editor Excalidraw — dipanggil tepat satu kali. */
function CanvasInstance({
  initialData,
  onReady,
  onChange,
  renderTopRightUI,
}: {
  initialData: ExcalidrawInitialDataState | null
  onReady: (api: ExcalidrawImperativeAPI) => void
  onChange: (els: readonly ExcalidrawElement[], _appState: unknown, fs: BinaryFiles) => void
  renderTopRightUI?: () => JSX.Element
}) {
  const { lang } = useLang()
  return (
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={onReady}
      langCode={lang === 'id' ? 'id' : 'en'}
      theme="light"
      onChange={onChange}
      renderTopRightUI={renderTopRightUI}
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
 *
 * KUNCI ANTI-HILANG: editor Excalidraw hanya dibuat SEKALI dan NODE-nya
 * TIDAK PERNAH DIPINDAH. Full screen murni perubahan class/posisi CSS —
 * wrapper yang sama naik jadi fixed inset-0 menutupi layar, lalu turun
 * lagi. Karena tidak ada remount ataupun appendChild, scene yang sudah
 * digambar mustahil hilang, di mode mana pun.
 *
 * Isi tersimpan dipasang lewat prop `initialData` (lihat toInitialData),
 * BUKAN lewat updateScene() sesudah mount — itu balapan dengan
 * initializeScene() Excalidraw dan berakhir dengan kanvas kosong tersimpan.
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
  const boardRef = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  // Pengguna pernah menggeser/zoom kanvas sendiri? Kalau sudah, auto-fit
  // tidak pernah mengusik pandangannya lagi.
  const userNavigatedRef = useRef(false)
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null)
  // Excalidraw membaca `initialData` SEKALI saat mount, jadi nilainya
  // dibekukan: update data di belakang tidak boleh menimpa kanvas yang
  // sedang digambar.
  const initialRef = useRef<ExcalidrawInitialDataState | null | undefined>(undefined)
  if (initialRef.current === undefined) initialRef.current = toInitialData(scene)

  /** Zoom & geser kanvas supaya SELURUH isi gambar terlihat. */
  const fitToContent = useCallback((animate = false) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements()
    if (!els || els.length === 0) return
    api.scrollToContent(els, { fitToViewport: true, viewportZoomFactor: 0.85, animate })
  }, [])

  const handleChange = useCallback(
    (els: readonly ExcalidrawElement[], _: unknown, fs: BinaryFiles) => {
      saveRef.current({ elements: els as unknown[], files: serializeFiles(fs) })
    },
    [],
  )

  const handleReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
  }, [])

  // Ukuran kanvas berubah (inline ↔ full screen, jendela di-resize, orientasi
  // HP) dan pengguna belum pernah navigasi manual: pasangkan ulang seluruh isi
  // supaya gambar yang sudah ada SELALU terlihat semua di kanvas.
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box || box.width === 0 || box.height === 0) return
      const prev = lastSizeRef.current
      lastSizeRef.current = { w: box.width, h: box.height }
      if (!prev) return
      const dw = Math.abs(box.width - prev.w) / prev.w
      const dh = Math.abs(box.height - prev.h) / prev.h
      if ((dw > 0.02 || dh > 0.02) && !userNavigatedRef.current) fitToContent(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitToContent])

  // Esc sengaja DIABAIKAN di mode fullscreen — hanya tombol Tutup yang menutup.
  useEffect(() => {
    if (!isFull) return
    const stop = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation()
    }
    document.addEventListener('keydown', stop, true)
    return () => document.removeEventListener('keydown', stop, true)
  }, [isFull])

  /* Saat full screen, halaman di belakang disembunyikan dari pembaca
     layar & interaksi; canvas menutup semuanya secara visual. */
  useEffect(() => {
    if (!isFull) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isFull])

  /* Tombol full screen DI DALAM Excalidraw (slot top-right) — ikut pindah
     otomatis saat mode fullscreen, jadi tidak pernah tertinggal di belakang. */
  const renderTopRightUI = useCallback(
    () => (
      <button
        type="button"
        onClick={() => setIsFull(true)}
        title={t('board.fullscreen')}
        aria-label={t('board.fullscreen')}
        className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-ink-soft shadow-sm transition-colors hover:bg-black/5 hover:text-ink"
      >
        <ExpandIcon className="h-[16px] w-[16px]" />
      </button>
    ),
    [t],
  )

  return (
    <div className={cx(isFull && 'contents')}>
      {/* ---------- editor: SATU instance, wrapper-nya berubah posisi ---------- */}
      <div
        ref={boardRef}
        role={isFull ? 'dialog' : undefined}
        aria-modal={isFull || undefined}
        onPointerDownCapture={(e) => {
          // Hanya interaksi di permukaan kanvas yang dihitung sebagai navigasi —
          // klik tombol toolbar (pena, bentuk, dst.) tidak boleh mematikan auto-fit.
          if ((e.target as HTMLElement).closest('canvas')) userNavigatedRef.current = true
        }}
        onWheelCapture={(e) => {
          if ((e.target as HTMLElement).closest('canvas')) userNavigatedRef.current = true
        }}
        className={cx(
          'flex flex-col overflow-hidden bg-white',
          isFull
            ? 'fixed inset-0 z-[120] rounded-none'
            : 'relative h-[68dvh] rounded-2xl border hairline',
        )}
      >
        <CanvasInstance
          initialData={initialRef.current}
          onReady={handleReady}
          onChange={handleChange}
          renderTopRightUI={renderTopRightUI}
        />

        {/* Tombol Tutup — satu-satunya cara keluar mode full screen. */}
        {isFull && (
          <button
            type="button"
            onClick={() => setIsFull(false)}
            className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-xl bg-ink/80 px-3.5 py-2 text-[13px] font-bold text-white shadow-lg backdrop-blur transition-colors hover:bg-ink"
          >
            <XIcon className="h-4 w-4" />
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  )
}

export type { ExcalidrawImperativeAPI }
