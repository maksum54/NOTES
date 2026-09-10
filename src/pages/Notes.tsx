import { useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { GlassCard } from '@/components/glass/Glass'
import { NoteCard } from '@/components/NoteCard'
import { TaskNoteModal, type TaskNoteDraft } from '@/components/TaskNoteModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { ArchiveIcon, PenIcon, PinIcon } from '@/components/icons'
import type { Note } from '@/types'

/**
 * CATATAN — sticky note bebas ala Google Keep, terpisah dari task:
 * - tombol "Catatan baru" membuat note langsung (lalu pop-up terbuka),
 * - klik kartu membuka pop-up editor yang sama dengan task,
 * - hover memunculkan pin (kanan-atas); note terarsip masuk section Arsip.
 */
export function NotesPage() {
  const { t } = useLang()
  const { data, addNote, updateNote } = useData()

  const [editingId, setEditingId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const pinned: Note[] = []
    const others: Note[] = []
    const archived: Note[] = []
    for (const note of data.notes) {
      if (note.archived) archived.push(note)
      else if (note.pinned) pinned.push(note)
      else others.push(note)
    }
    const byUpdated = (a: Note, b: Note) => b.updatedAt.localeCompare(a.updatedAt)
    ;[pinned, others, archived].forEach((list) => list.sort(byUpdated))
    return { pinned, others, archived }
  }, [data.notes])

  const editing = data.notes.find((n) => n.id === editingId) ?? null

  /** Buat note kosong lalu langsung buka pop-upnya. */
  const createNote = () => {
    const note = addNote({ title: '', body: '' })
    setEditingId(note.id)
  }

  /** Simpan perubahan dari pop-up — note di-refresh otomatis lewat store. */
  const saveEdit = (draft: TaskNoteDraft) => {
    if (!editingId) return
    updateNote(editingId, {
      title: draft.title,
      body: draft.html,
      pinned: draft.pinned,
      color: draft.color,
      collaborators: draft.collaborators ?? [],
      archived: draft.archived,
    })
  }

  const empty = data.notes.length === 0

  return (
    <>
      <PageHeader
        title={t('notes.title')}
        subtitle={t('notes.subtitle')}
        action={
          <button
            type="button"
            onClick={createNote}
            className="flex items-center gap-2 rounded-pill bg-accent px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgb(var(--accent)/0.9)] transition-transform hover:scale-[1.03] active:scale-95"
          >
            <PenIcon className="h-4 w-4" />
            {t('notes.new')}
          </button>
        }
      />

      <div className="stack-fade space-y-4">
        {empty && (
          <GlassCard className="p-10 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
              <PenIcon className="h-6 w-6" />
            </div>
            <p className="text-[14px] font-bold text-ink">{t('notes.emptyTitle')}</p>
            <p className="mx-auto mt-1 max-w-xs text-[12.5px] text-ink-faint">{t('notes.emptyHint')}</p>
            <button
              type="button"
              onClick={createNote}
              className="mt-4 rounded-pill bg-accent px-4 py-2 text-[13px] font-bold text-white transition-transform hover:scale-[1.03] active:scale-95"
            >
              {t('notes.new')}
            </button>
          </GlassCard>
        )}

        {groups.pinned.length > 0 && (
          <NoteSection icon={<PinIcon className="h-[18px] w-[18px] text-accent" />} title={t('notes.pinned')} notes={groups.pinned} onOpen={setEditingId} onTogglePin={(id) => updateNote(id, { pinned: false })} />
        )}
        {(groups.others.length > 0 || (groups.pinned.length > 0 && groups.others.length === 0)) && (
          <NoteSection icon={<PenIcon className="h-[18px] w-[18px] text-ink-soft" />} title={t('notes.others')} notes={groups.others} onOpen={setEditingId} onTogglePin={(id) => updateNote(id, { pinned: true })} />
        )}
        {groups.archived.length > 0 && (
          <NoteSection icon={<ArchiveIcon className="h-[18px] w-[18px] text-ink-soft" />} title={t('task.archivedSection')} notes={groups.archived} onOpen={setEditingId} onTogglePin={(id) => updateNote(id, { pinned: !groups.archived.find((n) => n.id === id)?.pinned })} archived />
        )}
      </div>

      {/* ---------- pop-up editor ala Keep (sama dengan task) ---------- */}
      {editing && (
        <TaskNoteModal
          key={editing.id}
          open
          initial={{
            title: editing.title,
            html: editing.body,
            pinned: editing.pinned,
            color: editing.color,
            dueDate: null,
            archived: editing.archived,
            collaborators: editing.collaborators ?? [],
          }}
          editedAt={editing.updatedAt}
          onChange={saveEdit}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  )
}

function NoteSection({
  icon,
  title,
  notes,
  onOpen,
  onTogglePin,
  archived = false,
}: {
  icon: React.ReactNode
  title: string
  notes: Note[]
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  archived?: boolean
}) {
  const { lang } = useLang()

  return (
    <GlassCard>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 text-[15px] font-bold text-ink">{title}</h2>
        <span className="rounded-pill bg-black/5 px-2 py-0.5 text-[11px] font-bold text-ink-faint dark:bg-white/10">
          {notes.length}
        </span>
      </div>

      {/* Masonry ala Keep: kolom CSS, kartu mengalir ke bawah tiap kolom. */}
      <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-5 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            title={note.title}
            html={note.body}
            pinned={note.pinned}
            color={note.color ?? undefined}
            meta={<span className="truncate">{formatShortDate(note.updatedAt, lang)}</span>}
            onTogglePin={archived ? undefined : () => onTogglePin(note.id)}
            onOpen={() => onOpen(note.id)}
          />
        ))}
      </div>
    </GlassCard>
  )
}

function formatShortDate(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}
