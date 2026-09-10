import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, Field, GlassButton, GlassCard, GlassInput, GlassTextarea,
} from '@/components/glass/Glass'
import { RichText } from '@/components/RichText'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { Segmented } from '@/components/glass/Segmented'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CheckIcon, ChevronLeft, ChevronRight, ClockIcon, ImageIcon,
  LinkIcon, PlusIcon, SparkIcon, TaskIcon, TrashIcon,
} from '@/components/icons'
import { cx, daysUntil, formatDate } from '@/lib/utils'
import type { Building, DoneStatus, Project, Task } from '@/types'

/**
 * Satu building: TARGET SUBMIT plus daftar TASK berbentuk kartu berslider
 * (tampilan sama dengan halaman Task, dan ikut ter-update saat task berubah).
 */
export function BuildingDetailPage() {
  const { projectId = '', buildingId = '' } = useParams()
  const { t } = useLang()
  const { data, updateBuilding, addTask, deleteTask } = useData()

  const ids = useMemo(() => ({ projectId, buildingId }), [projectId, buildingId])
  const found = useMemo(() => findBuilding(data, ids), [data, ids])

  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', dueDate: '' })
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)

  if (!found) return <Navigate to="/projects" replace />
  const { project, building } = found
  const left = daysUntil(building.targetSubmitDate)

  const submitTask = (e: FormEvent) => {
    e.preventDefault()
    if (!taskForm.title.trim()) return
    addTask(ids, { ...taskForm, dueDate: taskForm.dueDate || null })
    setTaskForm({ title: '', description: '', dueDate: '' })
    setTaskOpen(false)
  }

  return (
    <>
      <PageHeader
        title={building.name}
        subtitle={[project.name, building.notes].filter(Boolean).join(' · ') || undefined}
        back={`/projects/${project.id}`}
        crumbs={[
          { label: t('projects.title'), to: '/projects' },
          { label: project.name, to: `/projects/${project.id}` },
          { label: building.name },
        ]}
      />

      <div className="stack-fade space-y-4">
        {/* ---------- TARGET SUBMIT ---------- */}
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <ClockIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('building.targetSubmit')}</h2>
            {left !== null && building.targetSubmitStatus === 'belum' && (
              <Badge tone={left < 0 ? 'danger' : left <= 3 ? 'warn' : 'neutral'}>
                {left < 0 ? t('common.overdue') : left === 0 ? t('common.today') : t('common.dueIn', { n: left })}
              </Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('building.targetSubmitDate')}>
              <GlassInput
                type="date"
                value={building.targetSubmitDate?.slice(0, 10) ?? ''}
                onChange={(e) => updateBuilding(ids, { targetSubmitDate: e.target.value || null })}
              />
            </Field>
            <Field label={t('common.status')} group>
              <Segmented<DoneStatus>
                value={building.targetSubmitStatus}
                onChange={(v) => updateBuilding(ids, { targetSubmitStatus: v })}
                options={[
                  { value: 'belum', label: t('status.belum') },
                  { value: 'sudah', label: t('status.sudah') },
                ]}
                className="h-[46px] items-center"
              />
            </Field>
          </div>
        </GlassCard>

        {/* ---------- TASK (TUGAS) — kartu berslider, selalu membaca task terbaru ---------- */}
        <BuildingTaskSection
          rows={building.tasks.map((task) => ({ project, building, task }))}
          onNew={() => setTaskOpen(true)}
          onDelete={setPendingDelete}
        />
      </div>

      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title={t('building.newTask')}
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setTaskOpen(false)}>
              {t('common.cancel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={submitTask} disabled={!taskForm.title.trim()}>
              {t('common.save')}
            </GlassButton>
          </>
        }
      >
        <form onSubmit={submitTask} className="space-y-4">
          <Field label={t('task.titleLabel')}>
            <GlassInput
              autoFocus
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder={t('task.titlePlaceholder')}
              required
            />
          </Field>
          <Field label={`${t('common.description')} (${t('common.optional')})`}>
            <GlassTextarea
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder={t('task.descriptionPlaceholder')}
              rows={3}
            />
          </Field>
          <Field label={`${t('task.dueDate')} (${t('common.optional')})`}>
            <GlassInput
              type="date"
              value={taskForm.dueDate}
              onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteTask(ids, pendingDelete.id)}
        title={t('task.deleteTask')}
        message={`${pendingDelete?.title ?? ''} — ${t('common.confirmDelete')}`}
      />
    </>
  )
}

/** Jumlah task kartu yang tampil per "halaman" slider — sama dengan halaman Task. */
const PAGE_SIZE = 5

interface TaskRow {
  project: Project
  building: Building
  task: Task
}

/**
 * Section task satu building, tampilannya persis section task di halaman Task:
 * kartu yang bisa diklik ke detail, maksimal 5 per baris, sisanya lewat slider.
 * Karena `rows` selalu diturunkan dari `building.tasks` terbaru, kartu ikut
 * ter-update otomatis saat task berubah.
 */
function BuildingTaskSection({ rows, onNew, onDelete }: { rows: TaskRow[]; onNew: () => void; onDelete: (task: Task) => void }) {
  const { t } = useLang()
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <TaskIcon className="h-[18px] w-[18px] text-ink-soft" />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{t('building.tasks')}</h2>

        {/* Slider: muncul hanya kalau task lebih dari 5. */}
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center gap-1">
            <GlassButton
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('common.back')}
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </GlassButton>
            <span className="min-w-14 text-center text-[12px] font-bold text-ink-faint">
              {safePage + 1}/{pageCount}
            </span>
            <GlassButton
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('common.open')}
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </GlassButton>
          </div>
        )}
        <Badge tone="warn">{rows.filter((r) => r.task.status === 'belum').length}</Badge>
        <GlassButton variant="primary" size="sm" onClick={onNew} icon={<PlusIcon className="h-4 w-4" />}>
          {t('building.newTask')}
        </GlassButton>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-faint">{t('building.noTasks')}</p>
      ) : (
        <>
          {/* Grid: 5 kartu muat satu baris di layar lebar, otomatis turun di layar kecil. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {visible.map((row) => (
              <BuildingTaskCard key={row.task.id} row={row} onDelete={onDelete} />
            ))}
          </div>
          {rows.length > PAGE_SIZE && (
            <p className="mt-2 text-center text-[11.5px] text-ink-faint">
              {t('tasks.showing', { a: safePage * PAGE_SIZE + 1, b: Math.min((safePage + 1) * PAGE_SIZE, rows.length), n: rows.length })}
            </p>
          )}
        </>
      )}
    </GlassCard>
  )
}

/** Satu kartu task di halaman building — sama seperti TaskCard di halaman Task, plus hapus. */
function BuildingTaskCard({ row, onDelete }: { row: TaskRow; onDelete: (task: Task) => void }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { project, building, task } = row
  const href = `/projects/${project.id}/buildings/${building.id}/tasks/${task.id}`
  const left = daysUntil(task.dueDate)
  const done = task.status === 'sudah'

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => navigate(href)}
        className={cx(
          'glass glass-hover flex h-full w-full flex-col gap-2 rounded-2xl p-4 text-left',
          'shadow-[0_10px_30px_-12px_rgb(var(--shadow)/0.45)]',
          done && 'opacity-75',
        )}
      >
        <span className="flex w-full items-start gap-2.5">
          <span
            className={cx(
              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill border',
              done ? 'border-ok/50 bg-ok/15 text-ok' : 'border-ink/20 text-transparent',
            )}
          >
            <CheckIcon className="h-3 w-3" />
          </span>
          <span
            className={cx(
              'min-w-0 flex-1 break-words text-[14px] font-bold leading-snug text-ink',
              done && 'line-through',
            )}
          >
            {task.title}
          </span>
        </span>

        {/* Deskripsi: maksimal ~7 baris, sisanya discroll di dalam kartu.
            Bergaris seperti buku bila ada format; plain text tetap biasa. */}
        {task.description && (
          <span className="block max-h-40 overflow-y-auto break-words rounded-xl bg-glass-bg/25 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
            <RichText value={task.description} plainClassName="whitespace-pre-wrap" />
          </span>
        )}

        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-ink-faint">
          {task.dueDate && (
            <Badge tone={done ? 'neutral' : left !== null && left < 0 ? 'danger' : 'neutral'}>
              {formatDate(task.dueDate, lang)}
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1">
            {task.images.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <ImageIcon className="h-3 w-3" />
                {task.images.length}
              </span>
            )}
            {task.links.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <LinkIcon className="h-3 w-3" />
                {task.links.length}
              </span>
            )}
            {task.chat.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <SparkIcon className="h-3 w-3" />
                {task.chat.length}
              </span>
            )}
          </span>
        </span>
      </button>

      {/* Hapus di pojok kartu — di luar <button> supaya klik tidak ikut membuka task. */}
      <GlassButton
        variant="ghost"
        size="icon"
        aria-label={t('task.deleteTask')}
        onClick={() => onDelete(task)}
        className="!h-7 !w-7 absolute right-1.5 top-1.5 z-10"
      >
        <TrashIcon className="h-3.5 w-3.5 text-ink-faint hover:text-danger" />
      </GlassButton>
    </div>
  )
}
