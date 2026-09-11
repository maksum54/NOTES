import { useEffect, useState } from 'react'
import { useData } from '@/context/DataContext'
import { TaskNoteModal, PINNED_EVENT, type PopupBounds, type TaskNoteDraft } from '@/components/TaskNoteModal'
import { readRaw, removeRaw } from '@/lib/storage'
import type { Note, Task } from '@/types'

/**
 * HOST POPUP PINNED GLOBAL.
 *
 * Popup note/task yang di-pin harus tetap hidup walau user pindah halaman
 * (Task -> Catatan -> dst). Modal yang hidup di dalam satu halaman akan
 * ikut unmount saat halaman berganti — makanya saat pin dipasang modal
 * menyerahkan popup ke host ini (lewat PINNED_EVENT), dan host yang
 * merendernya di level App sehingga tidak terikat route mana pun.
 */

type PinnedTarget =
  | { kind: 'note'; note: Note; bounds: PopupBounds }
  | { kind: 'task'; projectId: string; buildingId: string; task: Task; label: string; bounds: PopupBounds }

export function PinnedPopupHost() {
  const { data, updateNote, updateTask } = useData()
  const [target, setTarget] = useState<PinnedTarget | null>(null)
  const [tick, setTick] = useState(0)

  /* Ambil alih popup: dipanggil lewat event internal dari modal yang baru
     di-pin, atau dipulihkan dari localStorage setelah reload. */
  const adopt = () => {
    const raw = readRaw('pinnedPopup')
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as {
        key?: string
        pos?: { x: number; y: number }
        width?: number
        height?: number
      }
      if (!saved.key) return
      const bounds: PopupBounds = { pos: saved.pos, width: saved.width, height: saved.height }
      if (saved.key.startsWith('note:')) {
        const note = data.notes.find((n) => n.id === saved.key!.slice(5))
        if (note && note.pinned) setTarget({ kind: 'note', note, bounds })
        return
      }
      if (saved.key.startsWith('task:')) {
        const taskId = saved.key.slice(5)
        for (const project of data.projects) {
          for (const building of project.buildings) {
            const task = building.tasks.find((x) => x.id === taskId)
            if (task && task.pinned) {
              setTarget({
                kind: 'task',
                projectId: project.id,
                buildingId: building.id,
                task,
                label: `${project.name} · ${building.name}`,
                bounds,
              })
              return
            }
          }
        }
      }
    } catch {
      /* data korup — abaikan */
    }
  }

  /* Popup yang baru saja di-pin di salah satu halaman diserahkan ke sini. */
  useEffect(() => {
    const onPinned = () => {
      // Modal menulis record pinnedPopup pada effect setelah state berubah —
      // tunggu satu tick supaya recordnya sudah tertulis.
      window.setTimeout(adopt, 30)
    }
    window.addEventListener(PINNED_EVENT, onPinned)
    return () => window.removeEventListener(PINNED_EVENT, onPinned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  /* Setelah reload: pulihkan popup pinned yang tertinggal. */
  useEffect(() => {
    adopt()
    // Sengaja sekali per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Target menghilang dari data (dihapus / di-unpin dari halaman lain) ->
     tutup popup. Data berubah juga berarti isi/kolor diedit di host. */
  useEffect(() => {
    if (!target) return
    if (target.kind === 'note') {
      const note = data.notes.find((n) => n.id === target.note.id)
      if (!note || !note.pinned) setTarget(null)
      else if (note !== target.note) setTarget({ ...target, note })
    } else {
      const project = data.projects.find((p) => p.id === target.projectId)
      const building = project?.buildings.find((b) => b.id === target.buildingId)
      const task = building?.tasks.find((x) => x.id === target.task.id)
      if (!project || !building || !task || !task.pinned) {
        setTarget(null)
      } else if (task !== target.task) {
        setTarget({ ...target, task, label: `${project.name} · ${building.name}` })
      }
    }
  }, [data, target])

  if (!target) return null

  const close = () => {
    removeRaw('pinnedPopup')
    setTarget(null)
    // Beri tahu aplikasi bahwa popup pinned sudah tidak ada (mis. untuk
    // membersihkan state halaman yang menyimpan jejak restore).
    setTick((x) => x + 1)
  }

  if (target.kind === 'note') {
    const { note, bounds } = target
    return (
      <TaskNoteModal
        key={`pin-${note.id}-${tick}`}
        open
        initial={{
          title: note.title,
          html: note.body,
          pinned: note.pinned,
          color: note.color,
          dueDate: null,
          archived: note.archived,
          collaborators: note.collaborators ?? [],
        }}
        editedAt={note.updatedAt}
        persistKey={`note:${note.id}`}
        initialBounds={bounds}
        onChange={(draft: TaskNoteDraft) =>
          updateNote(note.id, {
            title: draft.title,
            body: draft.html,
            pinned: draft.pinned,
            color: draft.color,
            collaborators: draft.collaborators ?? [],
            archived: draft.archived,
          })
        }
        onClose={close}
      />
    )
  }

  const { task, label, bounds } = target
  return (
    <TaskNoteModal
      key={`pin-${task.id}-${tick}`}
      open
      initial={{
        title: task.title,
        html: task.description,
        pinned: task.pinned ?? false,
        color: task.color ?? null,
        dueDate: task.dueDate,
        archived: task.archived ?? false,
        collaborators: task.collaborators ?? [],
      }}
      editedAt={task.updatedAt}
      locationLabel={label}
      persistKey={`task:${task.id}`}
      initialBounds={bounds}
      onChange={(draft: TaskNoteDraft) =>
        updateTask({ projectId: target.projectId, buildingId: target.buildingId }, task.id, {
          title: draft.title,
          description: draft.html,
          pinned: draft.pinned,
          color: draft.color,
          collaborators: draft.collaborators ?? [],
          dueDate: draft.dueDate,
          archived: draft.archived,
        })
      }
      onClose={close}
    />
  )
}
