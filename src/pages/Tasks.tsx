import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, GlassButton, GlassCard } from '@/components/glass/Glass'
import { NoteCard } from '@/components/NoteCard'
import { TaskNoteModal, type TaskNoteDraft } from '@/components/TaskNoteModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { ArchiveIcon, CheckIcon, ClockIcon, FolderIcon, TaskIcon } from '@/components/icons'
import { cx, daysUntil, formatDate, formatDateTime } from '@/lib/utils'
import type { Building, Project, Task } from '@/types'

/** Jumlah kartu yang tampil per "halaman" slider. */
const PAGE_SIZE = 10

interface TaskRow {
  project: Project
  building: Building
  task: Task
}

/**
 * Section TASK lintas project, kartunya ala Google Keep:
 - klik kartu membuka pop-up editor (judul + isi + toolbar),
 - hover memunculkan centang & pin,
 - task terarsip masuk section Arsip di bawah.
 */
export function TasksPage() {
  const { t } = useLang()
  const { data, updateTask, toggleTask } = useData()

  const [editing, setEditing] = useState<TaskRow | null>(null)

  /* Popup pinned dipulihkan & dirawat PinnedPopupHost di level App —
     halaman ini cukup membuka modal biasa saat kartu diklik. */

  const groups = useMemo(() => {
    const pinned: TaskRow[] = []
    const open: TaskRow[] = []
    const done: TaskRow[] = []
    const archived: TaskRow[] = []
    for (const project of data.projects) {
      for (const building of project.buildings) {
        for (const task of building.tasks) {
          const row: TaskRow = { project, building, task }
          if (task.archived) archived.push(row)
          else if (task.status === 'sudah') done.push(row)
          else if (task.pinned) pinned.push(row)
          else open.push(row)
        }
      }
    }
    // Yang paling mendesak dulu: lewat tenggat, lalu terdekat, lalu terbaru.
    const byDue = (a: TaskRow, b: TaskRow) => {
      if (!a.task.dueDate && !b.task.dueDate) return b.task.updatedAt.localeCompare(a.task.updatedAt)
      if (!a.task.dueDate) return 1
      if (!b.task.dueDate) return -1
      return a.task.dueDate.localeCompare(b.task.dueDate)
    }
    ;[pinned, open, done, archived].forEach((list) => list.sort(byDue))
    return { pinned, open, done, archived }
  }, [data.projects])

  const openCount = groups.pinned.length + groups.open.length

  /** Simpan perubahan dari pop-up — row di-refresh otomatis lewat store. */
  const saveEdit = (row: TaskRow, draft: TaskNoteDraft) => {
    updateTask(
      { projectId: row.project.id, buildingId: row.building.id },
      row.task.id,
      {
        title: draft.title,
        description: draft.html,
        pinned: draft.pinned,
        color: draft.color,
        collaborators: draft.collaborators ?? [],
        dueDate: draft.dueDate,
        status: draft.done ? 'sudah' : 'belum',
        archived: draft.archived,
      },
    )
  }

  const modalRow = editing
    ? {
        ...editing,
        task: findTask(data.projects, editing) ?? editing.task,
      }
    : null

  return (
    <>
      <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle')} />

      <div className="stack-fade space-y-4">
        {/* ---------- ringkasan SUDAH / BELUM ---------- */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard hover className="p-4">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-warn/15 text-warn">
              <ClockIcon className="h-[18px] w-[18px]" />
            </div>
            <p className="text-[27px] font-extrabold leading-none tracking-tight text-ink">{openCount}</p>
            <p className="mt-1.5 truncate text-[12px] font-semibold text-ink-faint">{t('tasks.open')}</p>
          </GlassCard>
          <GlassCard hover className="p-4">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-ok/15 text-ok">
              <CheckIcon className="h-[18px] w-[18px]" />
            </div>
            <p className="text-[27px] font-extrabold leading-none tracking-tight text-ink">{groups.done.length}</p>
            <p className="mt-1.5 truncate text-[12px] font-semibold text-ink-faint">{t('tasks.done')}</p>
          </GlassCard>
        </div>

        {groups.pinned.length > 0 && (
          <TaskSection title={t('tasks.pinned')} tone="warn" rows={groups.pinned} emptyTitle={t('tasks.allDone')} onOpen={setEditing} onToggle={toggleTask} />
        )}
        <TaskSection
          title={t('tasks.open')}
          tone="warn"
          rows={groups.open}
          emptyTitle={t('tasks.allDone')}
          emptyHint={t('tasks.allDoneHint')}
          onOpen={setEditing}
          onToggle={toggleTask}
        />
        <TaskSection title={t('tasks.done')} tone="ok" rows={groups.done} emptyTitle={t('tasks.noDone')} onOpen={setEditing} onToggle={toggleTask} />
        {groups.archived.length > 0 && (
          <ArchiveSection
            rows={groups.archived}
            onOpen={setEditing}
            onRestore={(row) =>
              updateTask({ projectId: row.project.id, buildingId: row.building.id }, row.task.id, {
                archived: false,
                status: 'belum',
              })
            }
          />
        )}
      </div>

      {/* ---------- pop-up editor ala Keep ---------- */}
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
          persistKey={`task:${modalRow.task.id}`}
          onChange={(draft) => saveEdit(modalRow, draft)}
          onClose={() => setEditing(null)}
          onPinned={() => setEditing(null)}
          onArchive={() => {}}
          onDelete={() => {}}
        />
      )}
    </>
  )
}

function findTask(projects: Project[], row: TaskRow): Task | undefined {
  return projects
    .find((p) => p.id === row.project.id)
    ?.buildings.find((b) => b.id === row.building.id)
    ?.tasks.find((x) => x.id === row.task.id)
}

function TaskSection({
  title,
  tone,
  rows,
  emptyTitle,
  emptyHint,
  onOpen,
  onToggle,
}: {
  title: string
  tone: 'warn' | 'ok' | 'neutral'
  rows: TaskRow[]
  emptyTitle: string
  emptyHint?: string
  onOpen: (row: TaskRow) => void
  onToggle: (ids: { projectId: string; buildingId: string }, taskId: string) => void
}) {
  const { t, lang } = useLang()
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <TaskIcon className={cx('h-[18px] w-[18px]', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink-soft')} />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{title}</h2>
        <Badge tone={tone === 'neutral' ? 'neutral' : tone}>{rows.length}</Badge>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-faint">{emptyTitle}</p>
      ) : (
        <>
          {/* Masonry ala Keep: kolom CSS, kartu mengalir ke bawah tiap kolom. */}
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
                    <Link
                      to={`/projects/${row.project.id}/buildings/${row.building.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate font-semibold text-accent hover:underline"
                      title={`${row.project.name} · ${row.building.name}`}
                    >
                      {row.project.name} · {row.building.name}
                    </Link>
                    {row.task.dueDate && (
                      <Badge
                        tone={
                          row.task.status === 'belum' && (daysUntil(row.task.dueDate) ?? 1) < 0 ? 'danger' : 'neutral'
                        }
                      >
                        {formatDate(row.task.dueDate, lang)}
                      </Badge>
                    )}
                  </>
                }
                onToggleDone={() => onToggle({ projectId: row.project.id, buildingId: row.building.id }, row.task.id)}
                onOpen={() => onOpen(row)}
              />
            ))}
          </div>
          {rows.length > PAGE_SIZE && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <GlassButton variant="ghost" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
                {t('common.back')}
              </GlassButton>
              <span className="text-[12px] font-bold text-ink-faint">{safePage + 1}/{pageCount}</span>
              <GlassButton variant="ghost" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                {t('common.open')}
              </GlassButton>
            </div>
          )}
        </>
      )}
      {emptyHint && rows.length === 0 && <p className="pb-4 text-center text-[12px] text-ink-faint">{emptyHint}</p>}
    </GlassCard>
  )
}

/**
 * ARSIP — task yang sudah ditandai selesai dari pop-up, dikelompokkan
 * per NAMA PROJECT supaya arsip lintas project tidak tercampur.
 * Centang di kartu mengembalikan task ke daftar aktif (keluar dari arsip).
 */
function ArchiveSection({
  rows,
  onOpen,
  onRestore,
}: {
  rows: TaskRow[]
  onOpen: (row: TaskRow) => void
  onRestore: (row: TaskRow) => void
}) {
  const { t, lang } = useLang()

  /* Satu sub-blok per project, urut nama; urutan kartu di dalamnya ikut
     urutan `rows` yang sudah disortir pemanggil. */
  const groups = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const row of rows) {
      const list = map.get(row.project.id)
      if (list) list.push(row)
      else map.set(row.project.id, [row])
    }
    return [...map.values()].sort((a, b) => a[0].project.name.localeCompare(b[0].project.name))
  }, [rows])

  return (
    <GlassCard>
      <div className="mb-1 flex items-center gap-2">
        <ArchiveIcon className="h-[18px] w-[18px] text-ink-soft" />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{t('task.archivedSection')}</h2>
        <Badge tone="neutral">{rows.length}</Badge>
      </div>
      <p className="mb-3 text-[12px] text-ink-faint">{t('task.archivedHint')}</p>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group[0].project.id}>
            <div className="mb-2 flex items-center gap-2 border-b border-black/5 pb-1.5 dark:border-white/10">
              <FolderIcon className="h-4 w-4 shrink-0 text-ink-faint" />
              <Link
                to={`/projects/${group[0].project.id}`}
                className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink hover:text-accent hover:underline"
              >
                {group[0].project.name}
              </Link>
              <span className="shrink-0 rounded-pill bg-black/5 px-2 py-0.5 text-[11px] font-bold text-ink-faint dark:bg-white/10">
                {group.length}
              </span>
            </div>

            {/* Masonry ala Keep, sama dengan section lain. */}
            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-5 [&>*]:mb-3 [&>*]:break-inside-avoid">
              {group.map((row) => (
                <NoteCard
                  key={row.task.id}
                  title={row.task.title}
                  html={row.task.description}
                  done
                  color={row.task.color ?? undefined}
                  meta={
                    <>
                      <Link
                        to={`/projects/${row.project.id}/buildings/${row.building.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-semibold text-accent hover:underline"
                        title={row.building.name}
                      >
                        {row.building.name}
                      </Link>
                      {row.task.dueDate && <Badge tone="neutral">{formatDate(row.task.dueDate, lang)}</Badge>}
                    </>
                  }
                  onToggleDone={() => onRestore(row)}
                  onOpen={() => onOpen(row)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </GlassCard>
  )
}

/** Format "Diedit 21.31" dipakai modal & kartu. */
export function editedLabel(iso: string, lang: string): string {
  return formatDateTime(iso, lang)
}
