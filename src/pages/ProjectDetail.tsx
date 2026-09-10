import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, ProgressBar } from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { AlertIcon, BuildingIcon, ChevronRight, ClockIcon, PlusIcon, TrashIcon } from '@/components/icons'
import { daysUntil, formatDate } from '@/lib/utils'
import type { Building } from '@/types'

/** NAMA PROJECT -> daftar NAMA BUILDING (nama bebas, bukan tiga area tetap). */
export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const { t, lang } = useLang()
  const { data, addBuilding, deleteBuilding } = useData()
  const project = data.projects.find((p) => p.id === projectId)

  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Building | null>(null)
  const [form, setForm] = useState({ name: '', notes: '' })

  if (!project) return <Navigate to="/projects" replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    addBuilding(project.id, form)
    setForm({ name: '', notes: '' })
    setOpen(false)
  }

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={[project.client, project.location].filter(Boolean).join(' · ') || undefined}
        back="/projects"
        crumbs={[{ label: t('projects.title'), to: '/projects' }, { label: project.name }]}
        action={
          <GlassButton variant="primary" onClick={() => setOpen(true)} icon={<PlusIcon className="h-4 w-4" />}>
            {t('projects.newBuilding')}
          </GlassButton>
        }
      />

      {project.buildings.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<BuildingIcon className="h-8 w-8" />}
            title={t('projects.noBuildings')}
            action={
              <GlassButton variant="primary" onClick={() => setOpen(true)} icon={<PlusIcon className="h-4 w-4" />}>
                {t('projects.newBuilding')}
              </GlassButton>
            }
          />
        </GlassCard>
      ) : (
        <div className="stack-fade grid gap-3 sm:grid-cols-2">
          {project.buildings.map((building) => {
            const done = building.tasks.filter((task) => task.status === 'sudah').length
            const left = daysUntil(building.targetSubmitDate)
            const serious =
              building.lastReview?.findings.filter((f) => f.severity !== 'info').length ?? 0
            const href = `/projects/${project.id}/buildings/${building.id}`
            return (
              <GlassCard key={building.id} hover className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
                    <BuildingIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={href} className="block">
                      <h2 className="truncate text-[16px] font-bold text-ink hover:text-accent">
                        {building.name}
                      </h2>
                    </Link>
                    {building.notes && (
                      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-faint">
                        {building.notes}
                      </p>
                    )}
                  </div>
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    aria-label={t('projects.deleteBuilding')}
                    onClick={() => setPendingDelete(building)}
                  >
                    <TrashIcon className="h-[18px] w-[18px] text-ink-faint hover:text-danger" />
                  </GlassButton>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={building.targetSubmitStatus === 'sudah' ? 'ok' : 'neutral'}>
                    {t(`status.${building.targetSubmitStatus}`)}
                  </Badge>
                  {serious > 0 && (
                    <Badge tone="danger" icon={<AlertIcon className="h-3 w-3" />}>
                      {serious}
                    </Badge>
                  )}
                  {left !== null && building.targetSubmitStatus === 'belum' && (
                    <Badge
                      tone={left < 0 ? 'danger' : left <= 3 ? 'warn' : 'neutral'}
                      icon={<ClockIcon className="h-3 w-3" />}
                    >
                      {formatDate(building.targetSubmitDate, lang)}
                    </Badge>
                  )}
                </div>

                {building.tasks.length > 0 ? (
                  <>
                    <ProgressBar
                      value={(done / building.tasks.length) * 100}
                      tone={done === building.tasks.length ? 'ok' : 'accent'}
                    />
                    <p className="text-[11.5px] font-semibold text-ink-faint">
                      {t('building.taskCount', { done, total: building.tasks.length })}
                    </p>
                  </>
                ) : (
                  <p className="text-[11.5px] text-ink-faint">{t('building.noTasks')}</p>
                )}

                <Link
                  to={href}
                  className="mt-auto flex items-center gap-1 pt-1 text-[13px] font-semibold text-accent hover:underline"
                >
                  {t('common.open')}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </GlassCard>
            )
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('projects.newBuilding')}
        subtitle={t('projects.buildingNameHint')}
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={submit} disabled={!form.name.trim()}>
              {t('common.save')}
            </GlassButton>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('projects.buildingName')} hint={t('projects.buildingNameHint')}>
            <GlassInput
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('projects.buildingNamePlaceholder')}
              required
            />
          </Field>
          <Field label={`${t('projects.buildingNotes')} (${t('common.optional')})`}>
            <GlassTextarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteBuilding(project.id, pendingDelete.id)}
        title={t('projects.deleteBuilding')}
        message={`${pendingDelete?.name ?? ''} — ${t('common.confirmDelete')}`}
      />
    </>
  )
}
