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
import {
  bySlot,
  keepPinnedPopups,
  readPinnedPopups,
  removePinnedPopup,
  type PinnedRecord,
  type PinSlot,
} from '@/lib/pinnedPopups'
import type { AppData, Note, Task } from '@/types'

/**
 * HOST POPUP PINNED GLOBAL.
 *
 * Popup note/task yang di-pin harus tetap hidup walau user pindah halaman
 * (Task -> Catatan -> dst). Modal yang hidup di dalam satu halaman akan
 * ikut unmount saat halaman berganti — makanya saat pin dipasang modal
 * menyerahkan popup ke host ini (lewat PINNED_EVENT), dan host yang
 * merendernya di level App sehingga tidak terikat route mana pun.
 *
 * Yang menempel boleh DUA sekaligus: satu di slot atas, satu di slot bawah
 * (lihat lib/pinnedPopups.ts). Keduanya bisa dilepas ke JENDELA STICKY yang
 * selalu tampil di atas aplikasi lain — di sana keduanya ditumpuk atas–bawah
 * dalam satu jendela, karena browser hanya mengizinkan satu jendela
 * Picture-in-Picture per tab. Lihat lib/detachedWindow.ts.
 */

type PinnedTarget =
  | { kind: 'note'; key: string; slot: PinSlot; bounds: PopupBounds; note: Note }
  | {
      kind: 'task'
      key: string
      slot: PinSlot
      bounds: PopupBounds
      projectId: string
      buildingId: string
      task: Task
      label: string
    }

export function PinnedPopupHost() {
  const { data, updateNote, updateTask } = useData()
  const { t } = useLang()
  const [targets, setTargets] = useState<PinnedTarget[]>([])
  /* Dinaikkan tiap kali daftar pin berubah dari luar (pin baru dipasang,
     popup ditutup) supaya daftar dibaca ulang dari localStorage. */
  const [rev, setRev] = useState(0)

  /* Jendela sticky bersama (null = semua popup masih menempel di halaman). */
  const [detached, setDetached] = useState<DetachedWindowHandle | null>(null)
  const detachedRef = useRef<DetachedWindowHandle | null>(null)
  detachedRef.current = detached
  const canDetach = useRef(supportsDetachedWindow()).current

  /* Dipakai saat jendela dibuka dari listener pin, di luar alur render. */
  const targetsRef = useRef<PinnedTarget[]>([])
  targetsRef.current = targets

  /* Daftar popup = record di localStorage yang masih ketemu datanya.
     Record yang catatannya sudah dihapus / tidak lagi pinned dibuang. */
  useEffect(() => {
    const records = readPinnedPopups()
    const resolved = records
      .slice()
      .sort(bySlot)
      .map((record) => resolve(record, data))
      .filter((x): x is PinnedTarget => x !== null)
    if (resolved.length !== records.length) keepPinnedPopups(resolved.map((x) => x.key))
    setTargets(resolved)
  }, [data, rev])

  /* Popup yang baru saja di-pin di salah satu halaman diserahkan ke sini. */
  useEffect(() => {
    const onPinned = () => {
      // Modal menulis record-nya pada effect setelah state berubah — tunggu
      // satu tick supaya recordnya sudah tertulis.
      window.setTimeout(() => {
        setRev((x) => x + 1)
        // Opsi "pin = langsung jadi sticky note": buka jendelanya sekarang,
        // selagi klik pin masih dihitung sebagai gestur pengguna. Event ini
        // juga terpancing saat pindah halaman — di situ gestur sudah habis,
        // jadi dilewati diam-diam, bukan dianggap gagal.
        if (isAutoStickyOn() && canDetach && !detachedRef.current && hasUserActivation()) {
          void detach(false)
        }
      }, 30)
    }
    window.addEventListener(PINNED_EVENT, onPinned)
    return () => window.removeEventListener(PINNED_EVENT, onPinned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Buka jendela sticky untuk popup yang sedang menempel. `announce` = beri
     tahu user kalau browser memblokir jendelanya (hanya untuk klik tombol,
     bukan untuk pembukaan otomatis). */
  const detach = async (announce: boolean) => {
    if (detachedRef.current) return
    const list = targetsRef.current
    const handle = await openDetachedWindow({
      width: 420,
      // Dua catatan ditumpuk dalam satu jendela -> jendelanya lebih tinggi.
      height: list.length > 1 ? 720 : 520,
      title: windowTitle(list, t('app.name')),
      onClose: () => setDetached(null),
    })
    if (!handle) {
      // Pop-up diblokir browser -> beri tahu, jangan diam-diam gagal.
      if (announce) window.alert(t('task.pipBlocked'))
      return
    }
    setDetached(handle)
  }

  /* Tidak ada lagi yang menempel -> jendela sticky ikut ditutup. */
  useEffect(() => {
    if (targets.length === 0 && detachedRef.current) {
      detachedRef.current.close()
      setDetached(null)
    }
  }, [targets])

  /* Host dilepas (logout / tab ditutup) -> tutup jendela sticky juga. */
  useEffect(() => () => detachedRef.current?.close(), [])

  /* Judul & tinggi jendela mengikuti isi yang sedang ditempel. */
  useEffect(() => {
    if (!detached || targets.length === 0) return
    try {
      detached.win.document.title = windowTitle(targets, t('app.name'))
      // Catatan kedua menempel setelah jendela terbuka -> beri ruang.
      if (targets.length > 1 && detached.win.innerHeight < 640) {
        detached.win.resizeTo(detached.win.outerWidth, 720)
      }
    } catch {
      /* jendela keburu ditutup */
    }
  }, [detached, targets, t])

  if (targets.length === 0) return null

  const close = (key: string) => {
    removePinnedPopup(key)
    setRev((x) => x + 1)
    // CATATAN: jangan paksa popup lain me-mount ulang di sini. Popup yang
    // di-mount ulang langsung menulis ulang record-nya, dan itu pernah
    // "menghidupkan kembali" popup yang baru saja ditutup.
  }

  /* Tombol sticky note di header popup: lepas SEMUA yang menempel ke jendela
     sendiri, atau kembalikan ke halaman. Dipanggil LANGSUNG dari klik karena
     baik Document PiP maupun window.open mensyaratkan gestur pengguna. */
  const toggleDetached = () => {
    if (detachedRef.current) {
      detachedRef.current.close()
      setDetached(null)
      return
    }
    void detach(true)
  }

  /* Prop yang sama untuk semua popup. */
  const windowProps = {
    onPipRequest: canDetach ? toggleDetached : undefined,
    detached: detached !== null,
    portalContainer: detached?.container ?? null,
  }
  const modeKey = detached ? 'win' : 'page'

  return (
    <>
      {targets.map((target) =>
        target.kind === 'note' ? (
          <TaskNoteModal
            key={`pin-${target.key}-${modeKey}`}
            {...windowProps}
            open
            initial={{
              title: target.note.title,
              html: target.note.body,
              pinned: target.note.pinned,
              color: target.note.color,
              dueDate: null,
              archived: target.note.archived,
              collaborators: target.note.collaborators ?? [],
            }}
            editedAt={target.note.updatedAt}
            persistKey={target.key}
            initialBounds={target.bounds}
            slot={target.slot}
            onChange={(draft: TaskNoteDraft) =>
              updateNote(target.note.id, {
                title: draft.title,
                body: draft.html,
                pinned: draft.pinned,
                color: draft.color,
                collaborators: draft.collaborators ?? [],
                archived: draft.archived,
              })
            }
            onClose={() => close(target.key)}
          />
        ) : (
          <TaskNoteModal
            key={`pin-${target.key}-${modeKey}`}
            {...windowProps}
            open
            initial={{
              title: target.task.title,
              html: target.task.description,
              pinned: target.task.pinned ?? false,
              color: target.task.color ?? null,
              dueDate: target.task.dueDate,
              archived: target.task.archived ?? false,
              collaborators: target.task.collaborators ?? [],
            }}
            editedAt={target.task.updatedAt}
            locationLabel={target.label}
            persistKey={target.key}
            initialBounds={target.bounds}
            slot={target.slot}
            onChange={(draft: TaskNoteDraft) =>
              updateTask({ projectId: target.projectId, buildingId: target.buildingId }, target.task.id, {
                title: draft.title,
                description: draft.html,
                pinned: draft.pinned,
                color: draft.color,
                collaborators: draft.collaborators ?? [],
                dueDate: draft.dueDate,
                archived: draft.archived,
              })
            }
            onClose={() => close(target.key)}
          />
        ),
      )}
    </>
  )
}

/** Cari note/task milik satu record; null kalau sudah hilang atau tidak pinned. */
function resolve(record: PinnedRecord, data: AppData): PinnedTarget | null {
  const bounds: PopupBounds = {
    pos: record.pos ?? undefined,
    width: record.width ?? undefined,
    height: record.height ?? undefined,
  }

  if (record.key.startsWith('note:')) {
    const note = data.notes.find((n) => n.id === record.key.slice(5))
    if (!note || !note.pinned) return null
    return { kind: 'note', key: record.key, slot: record.slot, bounds, note }
  }

  if (record.key.startsWith('task:')) {
    const taskId = record.key.slice(5)
    for (const project of data.projects) {
      for (const building of project.buildings) {
        const task = building.tasks.find((x) => x.id === taskId)
        if (task) {
          if (!task.pinned) return null
          return {
            kind: 'task',
            key: record.key,
            slot: record.slot,
            bounds,
            projectId: project.id,
            buildingId: building.id,
            task,
            label: `${project.name} · ${building.name}`,
          }
        }
      }
    }
  }
  return null
}

function windowTitle(targets: PinnedTarget[], fallback: string): string {
  const names = targets
    .map((x) => (x.kind === 'note' ? x.note.title : x.task.title).trim())
    .filter(Boolean)
  return names.length > 0 ? names.join(' · ') : fallback
}
