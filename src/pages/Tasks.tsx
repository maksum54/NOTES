import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, EmptyState, GlassCard } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckIcon, ChevronRight, ClockIcon, TaskIcon } from '@/components/icons'
import { cx, formatDate } from '@/lib/utils'
import type { Building, Project, Task } from '@/types'

/**
 * Section TASK lintas project: semua task dikumpulkan lalu dipisah
 * SUDAH / BELUM, persis seperti flowchart "TASK (TUGAS) -> SUDAH / BELUM".
 */
export function TasksPage() {
  const { t } = useLang()
  const { data } = useData()

  const groups = useMemo(() => {
    const open: TaskRow[] = []
    const done: TaskRow[] = []
    for (const project of data.projects) {
      for (const building of project.buildings) {
        for (const task of building.tasks) {
          const row: TaskRow = { project, building, task }
          ;(task.status === 'sudah' ? done : open).push(row)
        }
      }
    }
    // Yang paling mendesak di atas: lewat tenggat dulu, lalu terdekat.
    const byDue = (a: TaskRow, b: TaskRow) => {
      if (!a.task.dueDate && !b.task.dueDate) return b.task.updatedAt.localeCompare(a.task.updatedAt)
      if (!a.task.dueDate) return 1
      if (!b.task.dueDate) return -1
      return a.task.dueDate.localeCompare(b.task.dueDate)
    }
    open.sort(byDue)
    done.sort(byDue)
    return { open, done }
  }, [data.projects])

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
      />

      <div className="stack-fade space-y-4">
        {/* ---------- SUDAH / BELUM summary ---------- */}
        <div className="grid grid-cols-2 gap-3">
          <GlassCard hover className="p-4">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-warn/15 text-warn">
              <ClockIcon className="h-[18px] w-[18px]" />
            </div>
            <p className="text-[27px] font-extrabold leading-none tracking-tight text-ink">{groups.open.length}</p>
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

        {/* ---------- BELUM SELESAI (beserta deskripsi) ---------- */}
        <TaskSection
          title={t('tasks.open')}
          tone="warn"
          rows={groups.open}
          emptyTitle={t('tasks.allDone')}
          emptyHint={t('tasks.allDoneHint')}
          renderDescription
        />

        {/* ---------- SUDAH SELESAI ---------- */}
        <TaskSection title={t('tasks.done')} tone="ok" rows={groups.done} emptyTitle={t('tasks.noDone')} />
      </div>
    </>
  )
}

interface TaskRow {
  project: Project
  building: Building
  task: Task
}

function TaskSection({
  title,
  tone,
  rows,
  emptyTitle,
  emptyHint,
  renderDescription = false,
}: {
  title: string
  tone: 'warn' | 'ok'
  rows: TaskRow[]
  emptyTitle: string
  emptyHint?: string
  /** Task belum selesai ditampilkan lengkap dengan deskripsinya. */
  renderDescription?: boolean
}) {
  const { lang } = useLang()
  const navigate = useNavigate()
  const go = (row: TaskRow) =>
    navigate(`/projects/${row.project.id}/buildings/${row.building.id}/tasks/${row.task.id}`)

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <TaskIcon className={cx('h-[18px] w-[18px]', tone === 'ok' ? 'text-ok' : 'text-warn')} />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{title}</h2>
        <Badge tone={tone}>{rows.length}</Badge>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CheckIcon className="h-7 w-7" />} title={emptyTitle} hint={emptyHint} />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {rows.map(({ project, building, task }) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => go({ project, building, task })}
                className="flex w-full items-start gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-glass-bg/20"
              >
                <span
                  className={cx(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill border',
                    tone === 'ok' ? 'border-ok/50 bg-ok/15 text-ok' : 'border-ink/20 text-transparent',
                  )}
                >
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block break-words text-[14px] font-semibold leading-snug text-ink', tone === 'ok' && 'line-through opacity-60')}>
                    {task.title}
                  </span>
                  {/* Deskripsi tampil utuh persis seperti aslinya (baris & spasi dipertahankan). */}
                  {renderDescription && task.description && (
                    <span className="mt-1 block whitespace-pre-wrap break-words rounded-xl bg-glass-bg/20 px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
                      {task.description}
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-faint">
                    <span className="truncate">{project.name} · {building.name}</span>
                    {task.dueDate && (
                      <span className="font-semibold">· {formatDate(task.dueDate, lang)}</span>
                    )}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
