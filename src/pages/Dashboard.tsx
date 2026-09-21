import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { taskProgress } from '@/types'
import { useLang } from '@/context/LangContext'
import { useAuth } from '@/context/AuthContext'
import { Badge, EmptyState, GlassButton, GlassCard, ProgressBar } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertIcon, BellIcon, BoltIcon, BuildingIcon, ChevronRight,
  CheckIcon, ClockIcon, CloudIcon, FolderIcon, NoteIcon, PlusIcon, SparkIcon, TaskIcon,
} from '@/components/icons'
import { daysUntil, formatDate } from '@/lib/utils'
import { isAiReady } from '@/lib/ai'
import { useDriveStatus } from '@/lib/useDriveStatus'
import type { ReactNode } from 'react'

export function DashboardPage() {
  const { t, lang } = useLang()
  const { data } = useData()
  const { account } = useAuth()

  const stats = useMemo(() => {
    let buildings = 0
    let tasksTotal = 0
    let tasksDone = 0
    const upcoming: {
      key: string
      href: string
      project: string
      building: string
      date: string
      left: number
    }[] = []

    for (const project of data.projects) {
      buildings += project.buildings.length
      for (const building of project.buildings) {
        const progress = taskProgress(building.tasks)
        tasksTotal += progress.total
        tasksDone += progress.done
        if (building.targetSubmitStatus === 'belum' && building.targetSubmitDate) {
          const left = daysUntil(building.targetSubmitDate)
          if (left !== null) {
            upcoming.push({
              key: building.id,
              href: `/projects/${project.id}/buildings/${building.id}`,
              project: project.name,
              building: building.name,
              date: building.targetSubmitDate,
              left,
            })
          }
        }
      }
    }
    upcoming.sort((a, b) => a.left - b.left)
    return { buildings, tasksTotal, tasksDone, upcoming: upcoming.slice(0, 5) }
  }, [data.projects])

  const progress = stats.tasksTotal === 0 ? 0 : (stats.tasksDone / stats.tasksTotal) * 100
  const recentWarnings = data.warnings.slice(0, 4)

  /* Ajakan "Sambungkan Google Drive" hanya muncul kalau memang perlu tindakan
     user — bukan saat tokennya sedang diperbarui otomatis. */
  const drive = useDriveStatus()

  const todo = [
    data.projects.length === 0 && { to: '/projects', label: t('dashboard.createProject'), icon: <FolderIcon className="h-4 w-4" /> },
    !isAiReady() && { to: '/settings', label: t('dashboard.setupAi'), icon: <SparkIcon className="h-4 w-4" /> },
    drive.status === 'disconnected' && { to: '/settings', label: t('dashboard.connectDrive'), icon: <CloudIcon className="h-4 w-4" /> },
  ].filter(Boolean) as { to: string; label: string; icon: ReactNode }[]

  // Jam penyapa sesuai waktu setempat.
  const hour = new Date().getHours()
  const greeting =
    hour < 11 ? t('dashboard.morning') : hour < 15 ? t('dashboard.afternoon') : hour < 19 ? t('dashboard.evening') : t('dashboard.night')

  return (
    <>
      <PageHeader
        title={`${greeting}, ${account?.name ?? ''}`}
        subtitle={t('app.tagline')}
        action={
          <Link to="/projects">
            <GlassButton variant="primary" icon={<PlusIcon className="h-4 w-4" />}>
              {t('projects.newProject')}
            </GlassButton>
          </Link>
        }
      />

      <div className="stack-fade space-y-4">
        {/* --- kartu statistik --- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard to="/projects" icon={<FolderIcon className="h-[18px] w-[18px]" />} label={t('dashboard.projects')} value={data.projects.length} tone="accent" />
          <StatCard to="/projects" icon={<BuildingIcon className="h-[18px] w-[18px]" />} label={t('dashboard.buildings')} value={stats.buildings} tone="info" />
          <StatCard to="/tasks" icon={<TaskIcon className="h-[18px] w-[18px]" />} label={t('dashboard.openTasks')} value={stats.tasksTotal - stats.tasksDone} tone="warn" />
          <StatCard to="/notes" icon={<NoteIcon className="h-[18px] w-[18px]" />} label={t('nav.notes')} value={data.notes.length} tone="ok" />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* --- progres (lebar) --- */}
          <GlassCard className="lg:col-span-3">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">
                {t('dashboard.progress')}
              </p>
              <p className="text-[13px] font-semibold text-ink-faint">
                {stats.tasksDone}/{stats.tasksTotal} · {Math.round(progress)}%
              </p>
            </div>
            <ProgressBar value={progress} tone={progress >= 100 ? 'ok' : 'accent'} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
              {progress >= 100
                ? t('dashboard.progressDone')
                : t('dashboard.progressHint', { n: stats.tasksTotal - stats.tasksDone })}
            </p>
          </GlassCard>

          {/* --- mulai cepat --- */}
          {todo.length > 0 && (
            <GlassCard className="lg:col-span-2">
              <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-ink-soft">
                {t('dashboard.quickStart')}
              </p>
              <div className="flex flex-col gap-2">
                {todo.map((item) => (
                  <Link key={item.label} to={item.to}>
                    <GlassButton variant="glass" size="sm" className="w-full justify-start" icon={item.icon}>
                      {item.label}
                    </GlassButton>
                  </Link>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* --- target submit terdekat --- */}
          <GlassCard>
            <div className="mb-3 flex items-center gap-2">
              <ClockIcon className="h-[18px] w-[18px] text-ink-soft" />
              <p className="flex-1 text-[15px] font-bold text-ink">{t('dashboard.upcoming')}</p>
            </div>
            {stats.upcoming.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-faint">{t('dashboard.noUpcoming')}</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {stats.upcoming.map((u) => (
                  <li key={u.key}>
                    <Link
                      to={u.href}
                      className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-glass-bg/20"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{u.building}</p>
                        <p className="truncate text-[12px] text-ink-faint">
                          {u.project} · {formatDate(u.date, lang)}
                        </p>
                      </div>
                      <Badge tone={u.left < 0 ? 'danger' : u.left <= 3 ? 'warn' : 'neutral'}>
                        {u.left < 0
                          ? t('common.overdue')
                          : u.left === 0
                            ? t('common.today')
                            : t('common.dueIn', { n: u.left })}
                      </Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* --- peringatan terbaru --- */}
          <GlassCard>
            <div className="mb-3 flex items-center gap-2">
              <BellIcon className="h-[18px] w-[18px] text-ink-soft" />
              <p className="flex-1 text-[15px] font-bold text-ink">{t('dashboard.recentWarnings')}</p>
              <Link to="/warnings" className="text-[12px] font-semibold text-accent hover:underline">
                {t('common.open')}
              </Link>
            </div>
            {recentWarnings.length === 0 ? (
              <EmptyState
                icon={<CheckIcon className="h-7 w-7" />}
                title={t('warnings.empty')}
              />
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {recentWarnings.map((w) => (
                  <li key={w.id}>
                    <Link
                      to={w.href}
                      className="flex items-start gap-2.5 rounded-2xl px-2 py-2.5 transition-colors hover:bg-glass-bg/20"
                    >
                      <AlertIcon
                        className={
                          w.severity === 'critical'
                            ? 'mt-0.5 h-4 w-4 shrink-0 text-danger'
                            : w.severity === 'warning'
                              ? 'mt-0.5 h-4 w-4 shrink-0 text-warn'
                              : 'mt-0.5 h-4 w-4 shrink-0 text-info'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-ink">{w.title}</p>
                        <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-faint">{w.body}</p>
                      </div>
                      {!w.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-accent" />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>

        {/* --- pintasan project --- */}
        {data.projects.length > 0 && (
          <GlassCard>
            <div className="mb-3 flex items-center gap-2">
              <BoltIcon className="h-[18px] w-[18px] text-ink-soft" />
              <p className="flex-1 text-[15px] font-bold text-ink">{t('projects.title')}</p>
              <Link to="/projects" className="text-[12px] font-semibold text-accent hover:underline">
                {t('common.all')}
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.projects.slice(0, 4).map((p) => {
                const { done, total } = taskProgress(p.buildings.flatMap((b) => b.tasks))
                return (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="glass glass-hover flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                      <FolderIcon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-ink">{p.name}</p>
                      <p className="truncate text-[12px] text-ink-faint">
                        {t('projects.buildingCount', { n: p.buildings.length })}
                        {total > 0 && ` · ${t('building.taskCount', { done, total })}`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                )
              })}
            </div>
          </GlassCard>
        )}
      </div>
    </>
  )
}

function StatCard({
  to,
  icon,
  label,
  value,
  tone,
}: {
  to: string
  icon: ReactNode
  label: string
  value: number
  tone: 'accent' | 'info' | 'warn' | 'ok'
}) {
  const toneMap = {
    accent: 'bg-accent/15 text-accent',
    info: 'bg-info/15 text-info',
    warn: 'bg-warn/15 text-warn',
    ok: 'bg-ok/15 text-ok',
  }
  return (
    <Link to={to} className="block">
      <GlassCard hover className="p-4">
        <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${toneMap[tone]}`}>{icon}</div>
        <p className="text-[27px] font-extrabold leading-none tracking-tight text-ink">{value}</p>
        <p className="mt-1.5 truncate text-[12px] font-semibold text-ink-faint">{label}</p>
      </GlassCard>
    </Link>
  )
}
