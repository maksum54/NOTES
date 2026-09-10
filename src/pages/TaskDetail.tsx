import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, Spinner,
} from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CheckIcon, ImageIcon, PenIcon, PlusIcon, TrashIcon,
} from '@/components/icons'
import { compressImage, cx, formatDate, nowISO, uid } from '@/lib/utils'
import { useBufferedText } from '@/lib/useBufferedText'
import type { ChatMessage, TaskImage } from '@/types'
import type { BoardScene } from '@/features/whiteboard/ExcalidrawBoard'

// Excalidraw berat (~2 MB) — dimuat terpisah hanya saat papan dibuka.
const ExcalidrawBoard = lazy(() =>
  import('@/features/whiteboard/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawBoard })),
)
const sceneToPng = (scene: BoardScene, maxWidth?: number) =>
  import('@/features/whiteboard/ExcalidrawBoard').then((m) => m.sceneToPng(scene, maxWidth))

/**
 * Detail TASK: gambar + coretan papan tulis, link, dan tanya-jawab AI
 * yang sudah membawa konteks project/area/standard.
 */
export function TaskDetailPage() {
  const { projectId = '', buildingId = '', taskId = '' } = useParams()
  const { t, lang } = useLang()
  const { data, updateTask, deleteTask, toggleTask } = useData()

  const ids = useMemo(() => ({ projectId, buildingId }), [projectId, buildingId])
  const found = useMemo(() => findBuilding(data, ids), [data, ids])
  const task = found?.building.tasks.find((x) => x.id === taskId)

  const fileRef = useRef<HTMLInputElement>(null)
  const [boardImage, setBoardImage] = useState<TaskImage | null>(null)
  const [pendingDeleteImage, setPendingDeleteImage] = useState<TaskImage | null>(null)
  const [uploading, setUploading] = useState(false)

  // Dipanggil tanpa syarat (sebelum early return) supaya urutan hook tetap stabil.
  const currentTaskId = task?.id ?? ''
  const descriptionField = useBufferedText(task?.description ?? '', (next) => {
    if (currentTaskId) updateTask(ids, currentTaskId, { description: next })
  })
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  // Textarea tumbuh mengikuti isi: semua baris deskripsi terlihat tanpa scroll.
  const descriptionRows = useMemo(() => {
    const lines = descriptionField.value.split('\n').length
    return Math.max(4, Math.min(24, lines + 1))
  }, [descriptionField.value])

  if (!found || !task) return <Navigate to="/projects" replace />
  const { project, building } = found
  const buildingHref = `/projects/${project.id}/buildings/${building.id}`

  /* ---------- gambar ---------- */

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const added: TaskImage[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        // Dikompres dulu supaya localStorage tidak cepat penuh.
        const dataUrl = await compressImage(file)
        added.push({
          id: uid('img'),
          name: file.name,
          dataUrl,
          strokes: [],
          annotations: [],
          createdAt: nowISO(),
        })
      }
      if (added.length > 0) updateTask(ids, task.id, { images: [...task.images, ...added] })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** Simpan scene Excalidraw + segarkan thumbnail PNG-nya. */
  const saveMarkup = async (imageId: string, scene: BoardScene) => {
    const png = await sceneToPng(scene)
    updateTask(ids, task.id, {
      images: task.images.map((img) =>
        img.id === imageId
          ? {
              ...img,
              // Scene Excalidraw disimpan di field strokes (kompatibel model lama).
              strokes: scene as unknown as TaskImage['strokes'],
              // Thumbnail diperbarui kalau berhasil diekspor; kalau gagal,
              // gambar asli tetap dipakai sebagai pratinjau.
              dataUrl: png ?? img.dataUrl,
            }
          : img,
      ),
    })
  }

  /* ---------- link ---------- */
  /* Section link & tanya AI dihapus dari halaman task — percakapan AI
     cukup lewat halaman Asisten AI. Data lama (links/chat) tetap disimpan
     di model dan tidak hilang. */

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={`${project.name} · ${building.name}`}
        back={buildingHref}
        crumbs={[
          { label: project.name, to: `/projects/${project.id}` },
          { label: building.name, to: buildingHref },
          { label: t('task.title') },
        ]}
        action={
          <GlassButton
            variant={task.status === 'sudah' ? 'glass' : 'success'}
            onClick={() => toggleTask(ids, task.id)}
            icon={<CheckIcon className="h-4 w-4" />}
          >
            {task.status === 'sudah' ? t('task.markUndone') : t('task.markDone')}
          </GlassButton>
        }
      />

      <div className="stack-fade space-y-4">
        {/* ---------- detail ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={task.status === 'sudah' ? 'ok' : 'neutral'}>{t(`status.${task.status}`)}</Badge>
            {task.dueDate && <Badge tone="neutral">{formatDate(task.dueDate, lang)}</Badge>}
          </div>
          <GlassTextarea
            {...descriptionField}
            ref={descriptionRef}
            placeholder={t('task.descriptionPlaceholder')}
            rows={descriptionRows}
            className="resize-y leading-relaxed"
          />
          <div className="mt-3">
            <Field label={t('task.dueDate')}>
              <GlassInput
                type="date"
                value={task.dueDate?.slice(0, 10) ?? ''}
                onChange={(e) => updateTask(ids, task.id, { dueDate: e.target.value || null })}
                className="max-w-[220px]"
              />
            </Field>
          </div>
        </GlassCard>

        {/* ---------- gambar & coretan ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ImageIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('task.images')}</h2>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <GlassButton
              variant="primary"
              size="sm"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              icon={!uploading && <PlusIcon className="h-4 w-4" />}
            >
              {t('task.addImage')}
            </GlassButton>
          </div>

          {task.images.length === 0 ? (
            <EmptyState icon={<ImageIcon className="h-7 w-7" />} title={t('task.noImages')} hint={t('task.imageHint')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {task.images.map((img) => (
                <div key={img.id} className="glass overflow-hidden rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setBoardImage(img)}
                    className="relative block w-full"
                    aria-label={`${t('board.title')} — ${img.name}`}
                  >
                    {/* Thumbnail: hasil ekspor PNG papan Excalidraw, atau gambar asli. */}
                    <img src={img.dataUrl} alt={img.name} className="block w-full" />
                  </button>
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-faint">{img.name}</p>
                    <GlassButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('board.title')}
                      onClick={() => setBoardImage(img)}
                    >
                      <PenIcon className="h-3.5 w-3.5" />
                    </GlassButton>
                    <GlassButton
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('common.delete')}
                      onClick={() => setPendingDeleteImage(img)}
                    >
                      <TrashIcon className="h-3.5 w-3.5 hover:text-danger" />
                    </GlassButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassButton
          variant="ghost"
          className="text-danger"
          onClick={() => {
            if (window.confirm(t('common.confirmDelete'))) {
              deleteTask(ids, task.id)
              window.history.back()
            }
          }}
          icon={<TrashIcon className="h-4 w-4" />}
        >
          {t('task.deleteTask')}
        </GlassButton>
      </div>

      <Suspense
        fallback={
          <Modal open={boardImage !== null} onClose={() => setBoardImage(null)} title={t('board.title')}>
            <div className="flex items-center justify-center gap-2 py-14 text-[13px] text-ink-faint">
              <Spinner />
              {t('common.loading')}
            </div>
          </Modal>
        }
      >
        {boardImage && (
          <ExcalidrawBoard
            open={boardImage !== null}
            image={boardImage}
            onClose={() => setBoardImage(null)}
            onSave={(scene) => boardImage && void saveMarkup(boardImage.id, scene)}
          />
        )}
      </Suspense>

      <ConfirmDialog
        open={pendingDeleteImage !== null}
        onClose={() => setPendingDeleteImage(null)}
        onConfirm={() =>
          pendingDeleteImage &&
          updateTask(ids, task.id, { images: task.images.filter((i) => i.id !== pendingDeleteImage.id) })
        }
        title={t('common.delete')}
        message={t('common.confirmDelete')}
      />
    </>
  )
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <li className={cx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed',
          isUser
            ? 'bg-accent text-white shadow-[0_4px_14px_-6px_rgb(var(--accent)/0.8)]'
            : 'glass text-ink',
        )}
      >
        {message.content}
      </div>
    </li>
  )
}
