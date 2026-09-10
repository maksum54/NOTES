import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, Spinner,
} from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckIcon, PenIcon, TrashIcon } from '@/components/icons'
import { cx, formatDate, nowISO } from '@/lib/utils'
import { useBufferedText } from '@/lib/useBufferedText'
import type { CanvasScene, ChatMessage, ISODate, Task } from '@/types'

// Excalidraw berat (~2 MB) — dimuat terpisah hanya saat halaman task dibuka.
const ExcalidrawCanvas = lazy(() =>
  import('@/features/whiteboard/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawCanvas })),
)

/**
 * Detail TASK: deskripsi + canvas Excalidraw tertanam langsung.
 * Canvas auto-save (di-debounce) — tidak perlu tombol simpan.
 */
export function TaskDetailPage() {
  const { projectId = '', buildingId = '', taskId = '' } = useParams()
  const { t, lang } = useLang()
  const { data, updateTask, deleteTask, toggleTask } = useData()

  const ids = useMemo(() => ({ projectId, buildingId }), [projectId, buildingId])
  const found = useMemo(() => findBuilding(data, ids), [data, ids])
  const task = found?.building.tasks.find((x) => x.id === taskId)

  // Dipanggil tanpa syarat (sebelum early return) supaya urutan hook tetap stabil.
  const currentTaskId = task?.id ?? ''
  const descriptionField = useBufferedText(task?.description ?? '', (next) => {
    if (currentTaskId) updateTask(ids, currentTaskId, { description: next })
  })
  // Textarea tumbuh mengikuti isi: semua baris deskripsi terlihat tanpa scroll.
  const descriptionRows = useMemo(() => {
    const lines = descriptionField.value.split('\n').length
    return Math.max(4, Math.min(24, lines + 1))
  }, [descriptionField.value])

  /* ---------- canvas auto-save (debounce 800 ms) ---------- */
  const canvasTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [savedAt, setSavedAt] = useState<ISODate | null>(null)

  const saveCanvas = (scene: CanvasScene) => {
    if (!currentTaskId) return
    if (canvasTimer.current) clearTimeout(canvasTimer.current)
    canvasTimer.current = setTimeout(() => {
      updateTask(ids, currentTaskId, { canvas: scene })
      setSavedAt(nowISO())
    }, 800)
  }

  const clearCanvas = () => {
    if (!currentTaskId) return
    if (!window.confirm(t('common.confirmDelete'))) return
    if (canvasTimer.current) clearTimeout(canvasTimer.current)
    updateTask(ids, currentTaskId, { canvas: { elements: [] } })
    setSavedAt(nowISO())
    // Muat ulang editor supaya scene benar-benar kosong di layar.
    setCanvasEpoch((e) => e + 1)
  }

  const [canvasEpoch, setCanvasEpoch] = useState(0)

  if (!found || !task) return <Navigate to="/projects" replace />
  const { project, building } = found
  const buildingHref = `/projects/${project.id}/buildings/${building.id}`

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

        {/* ---------- canvas (Excalidraw) ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <PenIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('task.canvas')}</h2>
            {savedAt && <span className="text-[11.5px] text-ink-faint">{t('common.saved')}</span>}
            <GlassButton variant="ghost" size="sm" onClick={clearCanvas} icon={<TrashIcon className="h-4 w-4" />}>
              {t('board.clear')}
            </GlassButton>
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-faint">{t('board.pasteHint')}</p>

          <Suspense
            fallback={
              <div className="flex items-center justify-center gap-2 rounded-2xl border hairline py-20 text-[13px] text-ink-faint" style={{ height: '68dvh' }}>
                <Spinner />
                {t('common.loading')}
              </div>
            }
          >
            <ExcalidrawCanvas
              key={canvasEpoch}
              scene={task.canvas ?? null}
              onSave={saveCanvas}
            />
          </Suspense>
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
    </>
  )
}

/** Dipakai ulang di halaman Task untuk ringkasan isi canvas (jumlah elemen). */
export function canvasElementCount(task: Task): number {
  return task.canvas?.elements.length ?? 0
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
