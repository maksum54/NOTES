import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, ProgressBar } from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { BuildingIcon, ChevronRight, FolderIcon, PlusIcon, TrashIcon } from '@/components/icons'
import { formatDate } from '@/lib/utils'
import type { Project } from '@/types'

export function ProjectsPage() {
  const { t, lang } = useLang()
  const { data, addProject, deleteProject } = useData()
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', client: '', location: '' })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    addProject(form)
    setForm({ name: '', client: '', location: '' })
    setOpen(false)
  }

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        action={
          <GlassButton variant="primary" onClick={() => setOpen(true)} icon={<PlusIcon className="h-4 w-4" />}>
            {t('projects.newProject')}
          </GlassButton>
        }
      />

      {data.projects.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<FolderIcon className="h-8 w-8" />}
            title={t('projects.empty')}
            action={
              <GlassButton variant="primary" onClick={() => setOpen(true)} icon={<PlusIcon className="h-4 w-4" />}>
                {t('projects.newProject')}
              </GlassButton>
            }
          />
        </GlassCard>
      ) : (
        <div className="stack-fade grid gap-3 sm:grid-cols-2">
          {data.projects.map((project) => {
            const tasks = project.buildings.flatMap((b) => b.tasks)
            const done = tasks.filter((task) => task.status === 'sudah').length
            return (
              <GlassCard key={project.id} hover className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <FolderIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/projects/${project.id}`} className="block">
                      <h2 className="truncate text-[16px] font-bold text-ink hover:text-accent">
                        {project.name}
                      </h2>
                    </Link>
                    <p className="truncate text-[12.5px] text-ink-faint">
                      {[project.client, project.location].filter(Boolean).join(' · ') ||
                        formatDate(project.createdAt, lang)}
                    </p>
                  </div>
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    aria-label={t('projects.deleteProject')}
                    onClick={() => setPendingDelete(project)}
                  >
                    <TrashIcon className="h-[18px] w-[18px] text-ink-faint hover:text-danger" />
                  </GlassButton>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral" icon={<BuildingIcon className="h-3 w-3" />}>
                    {t('projects.buildingCount', { n: project.buildings.length })}
                  </Badge>
                  {tasks.length > 0 && (
                    <Badge tone={done === tasks.length ? 'ok' : 'accent'}>
                      {t('building.taskCount', { done, total: tasks.length })}
                    </Badge>
                  )}
                </div>

                {tasks.length > 0 && (
                  <ProgressBar value={(done / tasks.length) * 100} tone={done === tasks.length ? 'ok' : 'accent'} />
                )}

                <Link
                  to={`/projects/${project.id}`}
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
        title={t('projects.newProject')}
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
          <Field label={t('projects.projectName')}>
            <GlassInput
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('projects.projectNamePlaceholder')}
              required
            />
          </Field>
          <Field label={`${t('projects.client')} (${t('common.optional')})`}>
            <GlassInput
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder={t('projects.clientPlaceholder')}
            />
          </Field>
          <Field label={`${t('projects.location')} (${t('common.optional')})`}>
            <GlassInput
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={t('projects.locationPlaceholder')}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteProject(pendingDelete.id)}
        title={t('projects.deleteProject')}
        message={`${pendingDelete?.name ?? ''} — ${t('common.confirmDelete')}`}
      />
    </>
  )
}
