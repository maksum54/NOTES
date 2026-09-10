import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, ProgressBar } from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { AREA_ICON } from '@/components/areaIcon'
import { BuildingIcon, ChevronRight, PlusIcon, TrashIcon, AlertIcon } from '@/components/icons'
import { daysUntil, formatDate } from '@/lib/utils'
import type { Building } from '@/types'

/** NAMA PROJECT -> daftar NAMA BUILDING beserta ketiga areanya. */
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
        <div className="stack-fade space-y-3">
          {project.buildings.map((building) => (
            <GlassCard key={building.id}>
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-info/15 text-info">
                  <BuildingIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-bold text-ink">{building.name}</h2>
                  {building.notes && (
                    <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-faint">{building.notes}</p>
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

              <div className="grid gap-2.5 sm:grid-cols-3">
                {building.areas.map((area) => {
                  const Icon = AREA_ICON[area.kind]
                  const done = area.tasks.filter((task) => task.status === 'sudah').length
                  const left = daysUntil(area.targetSubmitDate)
                  const serious =
                    area.lastReview?.findings.filter((f) => f.severity !== 'info').length ?? 0
                  return (
                    <Link
                      key={area.id}
                      to={`/projects/${project.id}/buildings/${building.id}/areas/${area.id}`}
                      className="glass glass-hover flex flex-col gap-2.5 rounded-2xl p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-[18px] w-[18px] shrink-0 text-ink-soft" />
                        <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
                          {t(`areas.${area.kind}`)}
                        </p>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={area.targetSubmitStatus === 'sudah' ? 'ok' : 'neutral'}>
                          {t(`status.${area.targetSubmitStatus}`)}
                        </Badge>
                        {serious > 0 && (
                          <Badge tone="danger" icon={<AlertIcon className="h-3 w-3" />}>
                            {serious}
                          </Badge>
                        )}
                        {left !== null && area.targetSubmitStatus === 'belum' && (
                          <Badge tone={left < 0 ? 'danger' : left <= 3 ? 'warn' : 'neutral'}>
                            {formatDate(area.targetSubmitDate, lang)}
                          </Badge>
                        )}
                      </div>

                      {area.tasks.length > 0 ? (
                        <>
                          <ProgressBar
                            value={(done / area.tasks.length) * 100}
                            tone={done === area.tasks.length ? 'ok' : 'accent'}
                          />
                          <p className="text-[11.5px] font-semibold text-ink-faint">
                            {t('areas.taskCount', { done, total: area.tasks.length })}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11.5px] text-ink-faint">{t('areas.noTasks')}</p>
                      )}
                    </Link>
                  )
                })}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('projects.newBuilding')}
        subtitle={`${t('areas.finish_good')} · ${t('areas.raw_material')} · ${t('areas.utility')}`}
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
          <Field label={t('projects.buildingName')}>
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
