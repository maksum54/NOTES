import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { findBuilding, useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassTextarea, ProgressBar,
} from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { Segmented } from '@/components/glass/Segmented'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertIcon, BuildingIcon, CheckIcon, ChevronRight, ClockIcon, ImageIcon,
  LinkIcon, PlusIcon, SparkIcon, TrashIcon,
} from '@/components/icons'
import { cx, daysUntil, formatDate, formatDateTime } from '@/lib/utils'
import { isAiReady } from '@/lib/ai'
import type { DoneStatus, Finding, Task } from '@/types'

/**
 * Satu building. Inilah tempat SUMMARY CLIENT ditulis; menyimpannya
 * memicu review AI terhadap CATATAN STANDARD dan memunculkan WARNING.
 */
export function BuildingDetailPage() {
  const { projectId = '', buildingId = '' } = useParams()
  const { t, lang } = useLang()
  const { data, updateBuilding, runReview, addTask, deleteTask, toggleTask } = useData()

  const ids = useMemo(() => ({ projectId, buildingId }), [projectId, buildingId])
  const found = useMemo(() => findBuilding(data, ids), [data, ids])

  const [summary, setSummary] = useState(found?.building.summaryClient ?? '')
  const [dirty, setDirty] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', description: '', dueDate: '' })
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)

  if (!found) return <Navigate to="/projects" replace />
  const { project, building } = found

  const base = `/projects/${project.id}/buildings/${building.id}`
  const doneCount = building.tasks.filter((task) => task.status === 'sudah').length
  const left = daysUntil(building.targetSubmitDate)

  const saveSummary = () => {
    updateBuilding(ids, { summaryClient: summary })
    setDirty(false)
  }

  /** Simpan dulu, baru minta AI mereview — sesuai alur di flowchart. */
  const handleReview = async () => {
    if (!summary.trim()) return
    updateBuilding(ids, { summaryClient: summary })
    setDirty(false)
    setReviewing(true)
    setReviewError(null)
    try {
      await runReview(ids)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      setReviewError(msg === 'missing-api-key' ? t('assistant.noKey') : t('assistant.error', { msg }))
    } finally {
      setReviewing(false)
    }
  }

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
        {/* ---------- SUMMARY CLIENT ---------- */}
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <BuildingIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('building.summaryClient')}</h2>
            {dirty && <Badge tone="warn">•</Badge>}
          </div>

          <p className="mb-3 rounded-2xl border border-accent/20 bg-accent/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
            {t('building.summaryHint')}
          </p>

          <GlassTextarea
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value)
              setDirty(true)
            }}
            onBlur={() => dirty && saveSummary()}
            rows={6}
            placeholder={t('building.summaryPlaceholder')}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <GlassButton
              variant="primary"
              onClick={handleReview}
              loading={reviewing}
              disabled={!summary.trim()}
              icon={!reviewing && <SparkIcon className="h-4 w-4" />}
            >
              {reviewing ? t('building.reviewing') : t('building.reviewNow')}
            </GlassButton>
            {dirty && (
              <GlassButton variant="glass" onClick={saveSummary}>
                {t('common.save')}
              </GlassButton>
            )}
            {!isAiReady() && (
              <Link to="/settings" className="text-[12.5px] font-semibold text-accent hover:underline">
                {t('assistant.goSettings')}
              </Link>
            )}
            {data.standards.length === 0 && (
              <span className="text-[12px] text-ink-faint">{t('ai.noStandards')}</span>
            )}
          </div>

          {reviewError && (
            <p className="mt-3 rounded-2xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
              {reviewError}
            </p>
          )}
        </GlassCard>

        {/* ---------- HASIL REVIEW AI ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SparkIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('building.lastReview')}</h2>
            {building.lastReview && (
              <span className="text-[11.5px] text-ink-faint">
                {formatDateTime(building.lastReview.createdAt, lang)} · {building.lastReview.model}
              </span>
            )}
          </div>

          {!building.lastReview ? (
            <EmptyState icon={<SparkIcon className="h-7 w-7" />} title={t('building.neverReviewed')} />
          ) : (
            <div className="space-y-3">
              {building.lastReview.verdict && (
                <p className="rounded-2xl bg-glass-bg/20 px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                    {t('building.verdict')}
                  </span>
                  {building.lastReview.verdict}
                </p>
              )}

              {building.lastReview.findings.length === 0 ? (
                <div className="flex items-center gap-2 rounded-2xl border border-ok/25 bg-ok/10 px-4 py-3 text-[13.5px] font-semibold text-ok">
                  <CheckIcon className="h-[18px] w-[18px]" />
                  {t('building.noFindings')}
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {building.lastReview.findings.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </GlassCard>

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

        {/* ---------- TASK (TUGAS) ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CheckIcon className="h-[18px] w-[18px] text-ink-soft" />
            <h2 className="flex-1 text-[16px] font-bold text-ink">{t('building.tasks')}</h2>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={() => setTaskOpen(true)}
              icon={<PlusIcon className="h-4 w-4" />}
            >
              {t('building.newTask')}
            </GlassButton>
          </div>

          {building.tasks.length === 0 ? (
            <EmptyState icon={<CheckIcon className="h-7 w-7" />} title={t('building.noTasks')} />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3">
                <ProgressBar
                  value={(doneCount / building.tasks.length) * 100}
                  tone={doneCount === building.tasks.length ? 'ok' : 'accent'}
                />
                <span className="shrink-0 text-[12px] font-semibold text-ink-faint">
                  {t('building.taskCount', { done: doneCount, total: building.tasks.length })}
                </span>
              </div>

              <ul className="-mx-2 space-y-0.5">
                {building.tasks.map((task) => {
                  const taskLeft = daysUntil(task.dueDate)
                  return (
                    <li key={task.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-2 hover:bg-glass-bg/20">
                      <button
                        type="button"
                        onClick={() => toggleTask(ids, task.id)}
                        aria-label={task.status === 'sudah' ? t('task.markUndone') : t('task.markDone')}
                        className={cx(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-pill border-2 transition-all',
                          task.status === 'sudah'
                            ? 'border-ok bg-ok text-white'
                            : 'border-ink-faint/50 text-transparent hover:border-accent',
                        )}
                      >
                        <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>

                      <Link to={`${base}/tasks/${task.id}`} className="min-w-0 flex-1">
                        <p
                          className={cx(
                            'truncate text-[14px] font-semibold',
                            task.status === 'sudah' ? 'text-ink-faint line-through' : 'text-ink',
                          )}
                        >
                          {task.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-faint">
                          {task.dueDate && (
                            <span className={taskLeft !== null && taskLeft < 0 && task.status === 'belum' ? 'text-danger' : ''}>
                              {formatDate(task.dueDate, lang)}
                            </span>
                          )}
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
                        </div>
                      </Link>

                      <GlassButton
                        variant="ghost"
                        size="icon"
                        aria-label={t('task.deleteTask')}
                        onClick={() => setPendingDelete(task)}
                      >
                        <TrashIcon className="h-4 w-4 text-ink-faint hover:text-danger" />
                      </GlassButton>
                      <Link to={`${base}/tasks/${task.id}`} aria-label={t('common.open')}>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </GlassCard>
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

function FindingCard({ finding }: { finding: Finding }) {
  const { t } = useLang()
  const tone =
    finding.severity === 'critical'
      ? { border: 'border-danger/25', bg: 'bg-danger/8', text: 'text-danger', badge: 'danger' as const }
      : finding.severity === 'warning'
        ? { border: 'border-warn/25', bg: 'bg-warn/8', text: 'text-warn', badge: 'warn' as const }
        : { border: 'border-info/25', bg: 'bg-info/8', text: 'text-info', badge: 'info' as const }

  return (
    <li className={cx('rounded-2xl border px-4 py-3', tone.border, tone.bg)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertIcon className={cx('h-4 w-4 shrink-0', tone.text)} />
        <Badge tone={tone.badge}>{t(`warnings.severity.${finding.severity}`)}</Badge>
        <span className="font-mono text-[11.5px] font-semibold text-ink-soft">{finding.reference}</span>
      </div>
      <p className="text-[13.5px] font-semibold leading-relaxed text-ink">{finding.issue}</p>
      {finding.recommendation && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          <span className="font-bold text-ink-faint">{t('building.recommendation')}: </span>
          {finding.recommendation}
        </p>
      )}
    </li>
  )
}
