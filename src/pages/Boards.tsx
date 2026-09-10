import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, Spinner,
} from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckIcon, LinkIcon, PenIcon, PlusIcon, ShareIcon, TrashIcon, UsersIcon } from '@/components/icons'
import { formatDateTime, nowISO } from '@/lib/utils'
import type { CanvasScene, ISODate } from '@/types'

// Excalidraw berat — dimuat terpisah hanya saat board dibuka.
const ExcalidrawCanvas = lazy(() =>
  import('@/features/whiteboard/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawCanvas })),
)

/**
 * CANVAS BOARD — papan gambar mandiri untuk diskusi team.
 * Bisa di-share lewat link: siapa pun yang punya link (di browser
 * yang datanya tersinkron) membuka board yang sama.
 */
export function BoardsPage() {
  const { t, lang } = useLang()
  const { data, addBoard, deleteBoard } = useData()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const pending = data.boards.find((b) => b.id === pendingDelete)

  const submit = () => {
    if (!title.trim()) return
    const board = addBoard(title)
    setTitle('')
    setCreating(false)
    navigate(`/boards/${board.id}`)
  }

  return (
    <>
      <PageHeader
        title={t('boards.title')}
        subtitle={t('boards.subtitle')}
        action={
          <GlassButton variant="primary" onClick={() => setCreating(true)} icon={<PlusIcon className="h-4 w-4" />}>
            {t('boards.new')}
          </GlassButton>
        }
      />

      {data.boards.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PenIcon className="h-8 w-8" />}
            title={t('boards.empty')}
            hint={t('boards.emptyHint')}
            action={
              <GlassButton variant="primary" onClick={() => setCreating(true)} icon={<PlusIcon className="h-4 w-4" />}>
                {t('boards.new')}
              </GlassButton>
            }
          />
        </GlassCard>
      ) : (
        <div className="stack-fade grid gap-3 sm:grid-cols-2">
          {data.boards.map((board) => (
            <GlassCard key={board.id} hover className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
                  <PenIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/boards/${board.id}`} className="block">
                    <h2 className="truncate text-[16px] font-bold text-ink hover:text-accent">{board.title}</h2>
                  </Link>
                  <p className="truncate text-[12px] text-ink-faint">
                    {board.scene?.elements.length ?? 0} elemen · {formatDateTime(board.updatedAt, lang)}
                  </p>
                </div>
                <GlassButton
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.delete')}
                  onClick={() => setPendingDelete(board.id)}
                >
                  <TrashIcon className="h-[18px] w-[18px] text-ink-faint hover:text-danger" />
                </GlassButton>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="accent" icon={<UsersIcon className="h-3 w-3" />}>{t('boards.shareable')}</Badge>
                <Link
                  to={`/boards/${board.id}`}
                  className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
                >
                  {t('common.open')}
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('boards.new')}
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</GlassButton>
            <GlassButton variant="primary" onClick={submit} disabled={!title.trim()}>{t('common.save')}</GlassButton>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label={t('boards.nameLabel')}>
            <GlassInput
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('boards.namePlaceholder')}
              required
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteBoard(pendingDelete)}
        title={t('common.delete')}
        message={`${pending?.title ?? ''} — ${t('common.confirmDelete')}`}
      />
    </>
  )
}

/** Detail satu board: canvas + panel share link. */
export function BoardDetailPage() {
  const { boardId = '' } = useParams()
  const { t } = useLang()
  const { data, updateBoard, deleteBoard } = useData()
  const navigate = useNavigate()

  const board = data.boards.find((b) => b.id === boardId)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const canvasTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [savedAt, setSavedAt] = useState<ISODate | null>(null)

  const shareUrl = useMemo(() => {
    if (!board) return ''
    const base = `${window.location.origin}${window.location.pathname}`
    return `${base}#/boards/${board.id}?k=${board.shareKey}`
  }, [board])

  const saveScene = (scene: CanvasScene) => {
    if (!board) return
    if (canvasTimer.current) clearTimeout(canvasTimer.current)
    canvasTimer.current = setTimeout(() => {
      updateBoard(board.id, { scene })
      setSavedAt(nowISO())
    }, 800)
  }

  if (!board) return <BoardMissing />

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('boards.copyManual'), shareUrl)
    }
  }

  return (
    <>
      <PageHeader
        title={board.title}
        subtitle={t('boards.detailSubtitle')}
        back="/boards"
        crumbs={[{ label: t('boards.title'), to: '/boards' }, { label: board.title }]}
        action={
          <>
            {savedAt && <span className="self-center text-[12px] text-ink-faint">{t('common.saved')}</span>}
            <GlassButton variant="glass" onClick={() => setShareOpen(true)} icon={<ShareIcon className="h-4 w-4" />}>
              {t('boards.share')}
            </GlassButton>
            <GlassButton
              variant="ghost"
              className="text-danger"
              onClick={() => {
                if (window.confirm(t('common.confirmDelete'))) {
                  deleteBoard(board.id)
                  navigate('/boards')
                }
              }}
              icon={<TrashIcon className="h-4 w-4" />}
            >
              {t('common.delete')}
            </GlassButton>
          </>
        }
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 rounded-2xl border hairline py-20 text-[13px] text-ink-faint" style={{ height: '70dvh' }}>
            <Spinner />
            {t('common.loading')}
          </div>
        }
      >
        <ExcalidrawCanvas scene={board.scene ?? null} onSave={saveScene} />
      </Suspense>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={t('boards.share')}
        subtitle={t('boards.shareHint')}
        footer={
          <GlassButton variant="primary" onClick={() => setShareOpen(false)}>{t('common.close')}</GlassButton>
        }
      >
        <div className="space-y-3">
          <Field label={t('boards.shareLink')}>
            <div className="flex gap-2">
              <GlassInput readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
              <GlassButton
                variant={copied ? 'success' : 'primary'}
                onClick={() => void copyLink()}
                icon={copied ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </GlassButton>
            </div>
          </Field>
          <p className="rounded-2xl bg-glass-bg/20 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-faint">
            {t('boards.shareNote')}
          </p>
        </div>
      </Modal>
    </>
  )
}

function BoardMissing() {
  const { t } = useLang()
  return (
    <>
      <PageHeader title={t('boards.title')} back="/boards" />
      <GlassCard>
        <EmptyState icon={<PenIcon className="h-8 w-8" />} title={t('boards.notFound')} />
      </GlassCard>
    </>
  )
}
