import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, Field, GlassButton, GlassCard, GlassInput } from '@/components/glass/Glass'
import { NoteCard } from '@/components/NoteCard'
import { TaskNoteModal } from '@/components/TaskNoteModal'
import { ConfirmDialog } from '@/components/glass/Modal'
import { Segmented } from '@/components/glass/Segmented'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  ArchiveIcon, ChevronLeft, ChevronRight, ClockIcon, ImageIcon,
  LinkIcon, PlusIcon, SparkIcon, TaskIcon,
} from '@/components/icons'
import { daysUntil, formatDate } from '@/lib/utils'
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

  /* Task yang sedang dibuka di pop-up editor (id-nya, supaya isinya selalu
     ikut data terbaru). */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)

  if (!found) return <Navigate to="/projects" replace />
  const { project, building } = found
  const left = daysUntil(building.targetSubmitDate)

  /** Task baru = bikin task kosong lalu langsung buka pop-up editornya —
   *  alurnya sama persis dengan "Catatan Baru" di halaman Catatan, bukan
   *  form judul/deskripsi/tenggat yang terpisah. */
  const createTask = () => {
    const task = addTask(ids, { title: '', description: '', dueDate: null })
    if (task) setEditingId(task.id)
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
          editingId={editingId}
          onEdit={setEditingId}
          onNew={createTask}
          onDelete={setPendingDelete}
        />
      </div>

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
 * Section task satu building — kartu & pop-up ala Google Keep, sama seperti
 * halaman Task. `rows` selalu diturunkan dari `building.tasks` terbaru,
 * jadi kartu ikut ter-update otomatis saat task berubah.
 */
function BuildingTaskSection({
  rows, editingId, onEdit, onNew, onDelete,
}: {
  rows: TaskRow[]
  editingId: string | null
  onEdit: (id: string | null) => void
  onNew: () => void
  onDelete: (task: Task) => void
}) {
  const { t, lang } = useLang()
  const { toggleTask, updateTask } = useData()
  const [page, setPage] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  /* Task terarsip dipisah dari daftar aktif. */
  const active = rows.filter((r) => !r.task.archived)
  const archived = rows.filter((r) => r.task.archived)
  const shown = showArchived ? archived : active
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = shown.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const modalRow: TaskRow | null = editingId ? rows.find((r) => r.task.id === editingId) ?? null : null

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <TaskIcon className="h-[18px] w-[18px] text-ink-soft" />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{t('building.tasks')}</h2>

        {/* Slider: muncul hanya kalau task lebih dari 5. */}
        {shown.length > PAGE_SIZE && (
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
        <Badge tone="warn">{rows.filter((r) => r.task.status === 'belum' && !r.task.archived).length}</Badge>
        {archived.length > 0 && (
          <GlassButton
            variant={showArchived ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setShowArchived((v) => !v); setPage(0) }}
            icon={<ArchiveIcon className="h-4 w-4" />}
          >
            {t('task.archivedSection')} ({archived.length})
          </GlassButton>
        )}
        <GlassButton variant="primary" size="sm" onClick={onNew} icon={<PlusIcon className="h-4 w-4" />}>
          {t('building.newTask')}
        </GlassButton>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-faint">
          {showArchived ? t('task.archivedEmpty') : t('building.noTasks')}
        </p>
      ) : (
        <>
          {/* Masonry ala Keep: kartu mengalir antar kolom. */}
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-5 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {visible.map((row) => (
              <NoteCard
                key={row.task.id}
                title={row.task.title}
                html={row.task.description}
                done={row.task.status === 'sudah'}
                pinned={row.task.pinned}
                color={row.task.color ?? undefined}
                meta={
                  <>
                    {row.task.dueDate && (
                      <Badge tone={row.task.status !== 'sudah' && (daysUntil(row.task.dueDate) ?? 1) < 0 ? 'danger' : 'neutral'}>
                        {formatDate(row.task.dueDate, lang)}
                      </Badge>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1">
                      {row.task.images.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <ImageIcon className="h-3 w-3" />
                          {row.task.images.length}
                        </span>
                      )}
                      {row.task.links.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <LinkIcon className="h-3 w-3" />
                          {row.task.links.length}
                        </span>
                      )}
                      {row.task.chat.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <SparkIcon className="h-3 w-3" />
                          {row.task.chat.length}
                        </span>
                      )}
                    </span>
                  </>
                }
                onToggleDone={() => toggleTask({ projectId: row.project.id, buildingId: row.building.id }, row.task.id)}
                onTogglePin={() =>
                  updateTask({ projectId: row.project.id, buildingId: row.building.id }, row.task.id, {
                    pinned: !row.task.pinned,
                  })
                }
                onOpen={() => onEdit(row.task.id)}
              />
            ))}
          </div>
          {rows.length > PAGE_SIZE && (
            <p className="mt-2 text-center text-[11.5px] text-ink-faint">
              {t('tasks.showing', { a: safePage * PAGE_SIZE + 1, b: Math.min((safePage + 1) * PAGE_SIZE, rows.length), n: rows.length })}
            </p>
          )}
        </>
      )}

      {modalRow && (
        <TaskNoteModal
          key={modalRow.task.id}
          open
          initial={{
            title: modalRow.task.title,
            html: modalRow.task.description,
            pinned: modalRow.task.pinned ?? false,
            color: modalRow.task.color ?? null,
            dueDate: modalRow.task.dueDate,
            done: modalRow.task.status === 'sudah',
            archived: modalRow.task.archived ?? false,
            collaborators: modalRow.task.collaborators ?? [],
          }}
          editedAt={modalRow.task.updatedAt}
          locationLabel={`${modalRow.project.name} · ${modalRow.building.name}`}
          // Tanpa persistKey, pin dari halaman ini cuma menandai task tanpa
          // memunculkan popup menempel — beda dengan halaman Task & Catatan.
          persistKey={`task:${modalRow.task.id}`}
          onChange={(draft) =>
            updateTask({ projectId: modalRow.project.id, buildingId: modalRow.building.id }, modalRow.task.id, {
              title: draft.title,
              description: draft.html,
              pinned: draft.pinned,
              color: draft.color,
              collaborators: draft.collaborators ?? [],
              dueDate: draft.dueDate,
              status: draft.done ? 'sudah' : 'belum',
              archived: draft.archived,
            })
          }
          onClose={() => onEdit(null)}
          onPinned={() => onEdit(null)}
          onArchive={() => {}}
          onDelete={() => onDelete(modalRow.task)}
        />
      )}
    </GlassCard>
  )
}
