import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, GlassButton, GlassCard } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckIcon, ChevronLeft, ChevronRight, ClockIcon, TaskIcon } from '@/components/icons'
import { cx, daysUntil, formatDate } from '@/lib/utils'
import type { Building, Project, Task } from '@/types'

/** Jumlah task kartu yang tampil per "halaman" slider. */
const PAGE_SIZE = 5

/**
 * Section TASK lintas project: kartu task SUDAH / BELUM.
 - Maksimal 5 kartu per baris (grid auto-fit); kalau lebih dari 5,
   muncul slider dengan panah kiri/kanan.
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
    // Yang paling mendesak dulu: lewat tenggat, lalu terdekat, lalu terbaru.
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
      <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle')} />

      <div className="stack-fade space-y-4">
        {/* ---------- ringkasan SUDAH / BELUM ---------- */}
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

        <TaskSection
          title={t('tasks.open')}
          tone="warn"
          rows={groups.open}
          emptyTitle={t('tasks.allDone')}
          emptyHint={t('tasks.allDoneHint')}
          renderDescription
        />
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

/** Satu kartu task — diklik langsung ke detail task. */
function TaskCard({ row, tone, renderDescription }: { row: TaskRow; tone: 'warn' | 'ok'; renderDescription?: boolean }) {
  const { lang } = useLang()
  const navigate = useNavigate()
  const { project, building, task } = row
  const href = `/projects/${project.id}/buildings/${building.id}/tasks/${task.id}`
  const left = daysUntil(task.dueDate)

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={cx(
        'glass glass-hover flex h-full w-full flex-col gap-2 rounded-2xl p-4 text-left',
        tone === 'ok' && 'opacity-75',
      )}
    >
      <span className="flex w-full items-start gap-2.5">
        <span
          className={cx(
            'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill border',
            tone === 'ok' ? 'border-ok/50 bg-ok/15 text-ok' : 'border-ink/20 text-transparent',
          )}
        >
          <CheckIcon className="h-3 w-3" />
        </span>
        <span
          className={cx(
            'min-w-0 flex-1 break-words text-[14px] font-bold leading-snug text-ink',
            tone === 'ok' && 'line-through',
          )}
        >
          {task.title}
        </span>
      </span>

      {/* Deskripsi tampil utuh seperti aslinya. */}
      {renderDescription && task.description && (
        <span className="block whitespace-pre-wrap break-words rounded-xl bg-glass-bg/25 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
          {task.description}
        </span>
      )}

      <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-ink-faint">
        <span className="truncate">{project.name} · {building.name}</span>
        {task.dueDate && (
          <Badge tone={tone === 'ok' ? 'neutral' : left !== null && left < 0 ? 'danger' : 'neutral'}>
            {formatDate(task.dueDate, lang)}
          </Badge>
        )}
      </span>
    </button>
  )
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
  renderDescription?: boolean
}) {
  const { t } = useLang()
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        <TaskIcon className={cx('h-[18px] w-[18px]', tone === 'ok' ? 'text-ok' : 'text-warn')} />
        <h2 className="flex-1 text-[15px] font-bold text-ink">{title}</h2>

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
        <Badge tone={tone}>{rows.length}</Badge>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-faint">{emptyTitle}</p>
      ) : (
        <>
          {/* Grid: 5 kartu muat satu baris di layar lebar, otomatis turun di layar kecil. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {visible.map((row) => (
              <TaskCard key={row.task.id} row={row} tone={tone} renderDescription={renderDescription} />
            ))}
          </div>
          {rows.length > PAGE_SIZE && (
            <p className="mt-2 text-center text-[11.5px] text-ink-faint">
              {t('tasks.showing', { a: safePage * PAGE_SIZE + 1, b: Math.min((safePage + 1) * PAGE_SIZE, rows.length), n: rows.length })}
            </p>
          )}
        </>
      )}
      {emptyHint && rows.length === 0 && null}
    </GlassCard>
  )
}
