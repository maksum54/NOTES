import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, Spinner,
} from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { MarkupBoard, StrokeLayer } from '@/features/whiteboard/MarkupBoard'
import {
  CheckIcon, ImageIcon, LinkIcon, PenIcon, PlusIcon, SendIcon, SparkIcon, TrashIcon,
} from '@/components/icons'
import { compressImage, cx, formatDate, nowISO, uid } from '@/lib/utils'
import { useBufferedText } from '@/lib/useBufferedText'
import { assistantSystemPrompt, chat, isAiReady } from '@/lib/ai'
import type { ChatMessage, TaskImage, TaskLink } from '@/types'

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
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkForm, setLinkForm] = useState({ label: '', url: '' })
  const [prompt, setPrompt] = useState('')
  const [thinking, setThinking] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [pendingDeleteImage, setPendingDeleteImage] = useState<TaskImage | null>(null)
  const [uploading, setUploading] = useState(false)

  // Dipanggil tanpa syarat (sebelum early return) supaya urutan hook tetap stabil.
  const currentTaskId = task?.id ?? ''
  const descriptionField = useBufferedText(task?.description ?? '', (next) => {
    if (currentTaskId) updateTask(ids, currentTaskId, { description: next })
  })

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

  const saveMarkup = (imageId: string, patch: { strokes: TaskImage['strokes']; annotations: TaskImage['annotations'] }) => {
    updateTask(ids, task.id, {
      images: task.images.map((img) => (img.id === imageId ? { ...img, ...patch } : img)),
    })
  }

  /* ---------- link ---------- */

  const submitLink = (e: FormEvent) => {
    e.preventDefault()
    const url = linkForm.url.trim()
    if (!url) return
    const link: TaskLink = {
      id: uid('lnk'),
      label: linkForm.label.trim() || url,
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    }
    updateTask(ids, task.id, { links: [...task.links, link] })
    setLinkForm({ label: '', url: '' })
    setLinkOpen(false)
  }

  /* ---------- tanya AI ---------- */

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    const question = prompt.trim()
    if (!question || thinking) return
    if (!isAiReady()) {
      setChatError(t('assistant.noKey'))
      return
    }

    const userMsg: ChatMessage = { id: uid('msg'), role: 'user', content: question, createdAt: nowISO() }
    const history = [...task.chat, userMsg]
    updateTask(ids, task.id, { chat: history })
    setPrompt('')
    setThinking(true)
    setChatError(null)

    try {
      const context = [
        `Project: ${project.name}`,
        `Building: ${building.name}`,
        `Task: ${task.title}`,
        task.description && `Deskripsi task: ${task.description}`,
        building.summaryClient && `Summary client building ini: ${building.summaryClient}`,
      ]
        .filter(Boolean)
        .join('\n')

      const reply = await chat([
        { role: 'system', content: assistantSystemPrompt({ standards: data.standards, lang, extraContext: context }) },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ])

      updateTask(ids, task.id, {
        chat: [...history, { id: uid('msg'), role: 'assistant', content: reply, createdAt: nowISO() }],
      })
    } catch (err) {
      setChatError(t('assistant.error', { msg: err instanceof Error ? err.message : 'unknown' }))
    } finally {
      setThinking(false)
    }
  }

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
            rows={4}
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
                    <img src={img.dataUrl} alt={img.name} className="block w-full" />
                    <StrokeLayer strokes={img.strokes} />
                    {img.annotations.map((a) => (
                      <span
                        key={a.id}
                        style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color }}
                        className="pointer-events-none absolute -translate-y-1/2 whitespace-pre rounded bg-black/45 px-1 text-[10px] font-bold"
                      >
                        {a.text}
                      </span>
                    ))}
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

        {/* ---------- link ---------- */}
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <LinkIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('task.links')}</h2>
            <GlassButton variant="glass" size="sm" onClick={() => setLinkOpen(true)} icon={<PlusIcon className="h-4 w-4" />}>
              {t('task.addLink')}
            </GlassButton>
          </div>

          {task.links.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-faint">{t('task.noLinks')}</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {task.links.map((link) => (
                <li key={link.id} className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-glass-bg/20">
                  <LinkIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-accent hover:underline"
                  >
                    {link.label}
                  </a>
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('common.delete')}
                    onClick={() =>
                      updateTask(ids, task.id, { links: task.links.filter((l) => l.id !== link.id) })
                    }
                  >
                    <TrashIcon className="h-4 w-4 hover:text-danger" />
                  </GlassButton>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* ---------- tanya AI ---------- */}
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <SparkIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('task.askAi')}</h2>
            {task.chat.length > 0 && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => updateTask(ids, task.id, { chat: [] })}
              >
                {t('assistant.clear')}
              </GlassButton>
            )}
          </div>

          {task.chat.length === 0 ? (
            <p className="rounded-2xl bg-glass-bg/15 px-4 py-3 text-[13px] leading-relaxed text-ink-faint">
              {t('task.aiEmpty')}
            </p>
          ) : (
            <ul className="mb-3 space-y-2.5">
              {task.chat.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
            </ul>
          )}

          {thinking && (
            <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-faint">
              <Spinner />
              {t('assistant.thinking')}
            </div>
          )}
          {chatError && (
            <p className="mb-3 rounded-2xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
              {chatError}
            </p>
          )}

          <form onSubmit={ask} className="flex gap-2">
            <GlassInput
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('task.aiPlaceholder')}
              disabled={thinking}
            />
            <GlassButton
              type="submit"
              variant="primary"
              size="icon"
              className="h-[46px] w-[46px] shrink-0"
              disabled={!prompt.trim() || thinking}
              aria-label={t('task.send')}
            >
              <SendIcon className="h-[18px] w-[18px]" />
            </GlassButton>
          </form>
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

      <MarkupBoard
        open={boardImage !== null}
        image={boardImage}
        onClose={() => setBoardImage(null)}
        onSave={(patch) => boardImage && saveMarkup(boardImage.id, patch)}
      />

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={t('task.addLink')}
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setLinkOpen(false)}>
              {t('common.cancel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={submitLink} disabled={!linkForm.url.trim()}>
              {t('common.save')}
            </GlassButton>
          </>
        }
      >
        <form onSubmit={submitLink} className="space-y-4">
          <Field label={t('task.linkUrl')}>
            <GlassInput
              autoFocus
              value={linkForm.url}
              onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })}
              placeholder="https://…"
              required
            />
          </Field>
          <Field label={`${t('task.linkLabel')} (${t('common.optional')})`}>
            <GlassInput
              value={linkForm.label}
              onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

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
