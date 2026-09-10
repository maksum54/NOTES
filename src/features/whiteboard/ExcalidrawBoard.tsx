import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Excalidraw,
  exportToBlob,
  loadFromBlob,
} from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types'
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import { useLang } from '@/context/LangContext'
import { GlassButton } from '@/components/glass/Glass'
import { Modal } from '@/components/glass/Modal'
import { TrashIcon, XIcon } from '@/components/icons'
import type { TaskImage } from '@/types'

/* ============================================================
   Papan gambar berbasis Excalidraw (https://github.com/excalidraw/excalidraw)
   Menggantikan papan coretan manual. Fitur bawaan Excalidraw:
   - Pena, bentuk, panah, teks, sticky note, undo/redo
   - COPY-PASTE GAMBAR langsung ke canvas (Ctrl+V / Cmd+V)
   ============================================================ */

/** Wadah scene yang disimpan pada satu TaskImage. */
export interface BoardScene {
  type: 'excalidraw'
  version: 1
  elements: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, { id: string; dataURL: string; mimeType: string; created: number }>
}

const EMPTY: BoardScene = { type: 'excalidraw', version: 1, elements: [] }

export function ExcalidrawBoard({
  open,
  image,
  onClose,
  onSave,
}: {
  open: boolean
  image: TaskImage | null
  onClose: () => void
  onSave: (scene: BoardScene) => void
}) {
  const { t, lang } = useLang()
  const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [elements, setElements] = useState<readonly ExcalidrawElement[] | null>(null)
  const [files, setFiles] = useState<BinaryFiles | null>(null)
  const [dirty, setDirty] = useState(false)

  // Reset scene tiap kali board dibuka dengan gambar berbeda.
  useEffect(() => {
    if (!open) return
    const stored = (image?.strokes as unknown as BoardScene | undefined) ?? null
    setElements((stored && stored.type === 'excalidraw' ? stored.elements : []) as readonly ExcalidrawElement[])
    setFiles((stored?.files as BinaryFiles ?? null))
    setDirty(false)
  }, [open, image])

  const handleChange = useCallback(
    (els: readonly ExcalidrawElement[], _: unknown, fs: BinaryFiles) => {
      setElements(els)
      setFiles(fs)
      setDirty(true)
    },
    [],
  )

  const save = useCallback(() => {
    if (!elements) return
    const scene: BoardScene = {
      type: 'excalidraw',
      version: 1,
      elements: elements as unknown[],
      files: Object.fromEntries(
        Object.entries(files ?? {}).map(([id, f]) => [
          id,
          { id: f.id, dataURL: f.dataURL, mimeType: f.mimeType, created: f.created },
        ]),
      ) as BoardScene['files'],
    }
    onSave(scene)
    onClose()
  }, [elements, files, onSave, onClose])

  const clearAll = useCallback(() => {
    excalidrawRef.current?.resetScene()
    setFiles(null)
    setDirty(true)
  }, [])

  if (!image) return null

  return (
    <Modal open={open} onClose={onClose} size="full" title={image.name} subtitle={t('board.excalidrawHint')}>
      <div className="flex h-full min-h-[60dvh] flex-col gap-3">
        <div
          className="min-h-0 flex-1 overflow-hidden rounded-2xl border hairline"
          style={{ height: '72dvh' }}
        >
          <Excalidraw
            excalidrawAPI={(api) => (excalidrawRef.current = api)}
            initialData={{
              elements: elements ?? [],
              files: files ?? undefined,
              appState: { viewBackgroundColor: '#ffffff' },
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

        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-[12px] leading-relaxed text-ink-faint">{t('board.pasteHint')}</p>
          <GlassButton variant="ghost" onClick={clearAll} icon={<TrashIcon className="h-4 w-4" />}>
            {t('board.clear')}
          </GlassButton>
          <GlassButton variant="ghost" onClick={onClose} icon={<XIcon className="h-4 w-4" />}>
            {t('common.cancel')}
          </GlassButton>
          <GlassButton variant="primary" onClick={save} disabled={!dirty}>
            {t('board.saveBoard')}
          </GlassButton>
        </div>
      </div>
    </Modal>
  )
}

/** Ekspor scene Excalidraw jadi PNG — dipakai thumbnail di daftar gambar task. */
export async function sceneToPng(scene: BoardScene, maxWidth = 1600): Promise<string | null> {
  try {
    const blob = await exportToBlob({
      elements: scene.elements as never,
      files: (scene.files as never) ?? null,
      appState: { viewBackgroundColor: '#ffffff', exportBackground: true },
      mimeType: 'image/png',
      maxWidthOrHeight: maxWidth,
    })
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Baca file .excalidraw / .json yang di-paste sebagai scene. */
export async function loadSceneFile(file: Blob): Promise<BoardScene | null> {
  try {
    const data = await loadFromBlob(file as never, null, null)
    return {
      type: 'excalidraw',
      version: 1,
      elements: (data.elements ?? []) as unknown[],
      appState: data.appState as Record<string, unknown> | undefined,
      files: (data.files ?? undefined) as BoardScene['files'],
    }
  } catch {
    return null
  }
}

export type { TaskImage }
export { EMPTY as EMPTY_SCENE }
