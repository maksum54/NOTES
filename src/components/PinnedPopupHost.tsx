import { useEffect, useRef, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { TaskNoteModal, PINNED_EVENT, type PopupBounds, type TaskNoteDraft } from '@/components/TaskNoteModal'
import {
  hasUserActivation,
  isAutoStickyOn,
  openDetachedWindow,
  supportsDetachedWindow,
  type DetachedWindowHandle,
} from '@/lib/detachedWindow'
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
 *
 * Host ini juga yang MELEPAS catatan ke jendela sendiri (tombol sticky note
 * di header popup): isinya pindah ke jendela Document PiP yang selalu tampil
 * di atas aplikasi lain — jadi catatan tetap terlihat walau browsernya
 * di-minimize. Lihat src/lib/detachedWindow.ts.
 */

type PinnedTarget =
  | { kind: 'note'; note: Note; bounds: PopupBounds }
  | { kind: 'task'; projectId: string; buildingId: string; task: Task; label: string; bounds: PopupBounds }

export function PinnedPopupHost() {
  const { data, updateNote, updateTask } = useData()
  const { t } = useLang()
  const [target, setTarget] = useState<PinnedTarget | null>(null)
  const [tick, setTick] = useState(0)
  /* Jendela sticky terpisah (null = popup masih menempel di halaman). */
  const [detached, setDetached] = useState<DetachedWindowHandle | null>(null)
  const detachedRef = useRef<DetachedWindowHandle | null>(null)
  detachedRef.current = detached
  const canDetach = useRef(supportsDetachedWindow()).current
  /* Judul & ukuran popup terakhir — dipakai saat jendela sticky dibuka dari
     listener pin (di luar alur render). */
  const titleRef = useRef('')
  const boundsRef = useRef<PopupBounds>({})
  titleRef.current = target
    ? (target.kind === 'note' ? target.note.title : target.task.title).trim()
    : titleRef.current
  boundsRef.current = target?.bounds ?? boundsRef.current

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
      window.setTimeout(() => {
        adopt()
        // Opsi "pin = langsung jadi sticky note": buka jendelanya sekarang,
        // selagi klik pin masih dihitung sebagai gestur pengguna. Event ini
        // juga terpancing saat pindah halaman — di situ gestur sudah habis,
        // jadi dilewati diam-diam, bukan dianggap gagal.
        if (
          isAutoStickyOn() &&
          canDetach &&
          !detachedRef.current &&
          hasUserActivation()
        ) {
          void detach(false)
        }
      }, 30)
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

  /* Buka jendela sticky untuk popup yang sedang aktif. `announce` = beri
     tahu user kalau browser memblokir jendelanya (hanya untuk klik tombol,
     bukan untuk pembukaan otomatis). */
  const detach = async (announce: boolean) => {
    if (detachedRef.current) return
    const handle = await openDetachedWindow({
      width: boundsRef.current.width ?? 420,
      height: boundsRef.current.height ?? 520,
      title: titleRef.current || t('app.name'),
      onClose: () => setDetached(null),
    })
    if (!handle) {
      // Pop-up diblokir browser -> beri tahu, jangan diam-diam gagal.
      if (announce) window.alert(t('task.pipBlocked'))
      return
    }
    setDetached(handle)
  }

  /* Popup hilang (di-unpin atau dihapus dari halaman lain) -> jendela
     sticky-nya ikut ditutup, jangan ditinggal menggantung. */
  useEffect(() => {
    if (!target && detachedRef.current) {
      detachedRef.current.close()
      setDetached(null)
    }
  }, [target])

  /* Host dilepas (logout / tab ditutup) -> tutup jendela sticky juga. */
  useEffect(() => () => detachedRef.current?.close(), [])

  /* Judul jendela sticky mengikuti judul catatan yang sedang dibuka. */
  useEffect(() => {
    if (!detached || !target) return
    const title = target.kind === 'note' ? target.note.title : target.task.title
    try {
      detached.win.document.title = title.trim() || t('app.name')
    } catch {
      /* jendela keburu ditutup */
    }
  }, [detached, target, t])

  if (!target) return null

  const close = () => {
    removeRaw('pinnedPopup')
    detachedRef.current?.close()
    setDetached(null)
    setTarget(null)
    // Beri tahu aplikasi bahwa popup pinned sudah tidak ada (mis. untuk
    // membersihkan state halaman yang menyimpan jejak restore).
    setTick((x) => x + 1)
  }

  /* Tombol sticky note di header popup: lepas catatan ke jendela sendiri,
     atau kembalikan ke halaman. Dipanggil LANGSUNG dari klik karena baik
     Document PiP maupun window.open mensyaratkan gestur pengguna. */
  const toggleDetached = () => {
    if (detachedRef.current) {
      detachedRef.current.close()
      setDetached(null)
      return
    }
    void detach(true)
  }

  /* Prop yang sama untuk popup catatan maupun task. */
  const windowProps = {
    onPipRequest: canDetach ? toggleDetached : undefined,
    detached: detached !== null,
    portalContainer: detached?.container ?? null,
  }
  const modeKey = detached ? 'win' : 'page'

  if (target.kind === 'note') {
    const { note, bounds } = target
    return (
      <TaskNoteModal
        key={`pin-${note.id}-${tick}-${modeKey}`}
        {...windowProps}
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
      key={`pin-${task.id}-${tick}-${modeKey}`}
      {...windowProps}
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
