import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  emptyData,
  type AiReview,
  type AppData,
  type Building,
  type CanvasBoard,
  type ChatMessage,
  type DoneStatus,
  type ISODate,
  type Member,
  type Note,
  type Project,
  type StandardNote,
  type Task,
  type Warning,
} from '@/types'
import { loadData, migrate, saveData } from '@/lib/storage'
import { daysUntil, nowISO, uid } from '@/lib/utils'
import { reviewSummary, isAiReady } from '@/lib/ai'
import { backupToDrive, isAutoSyncOn, isDriveConnected, silentReconnect } from '@/lib/drive'
import { showNotification } from '@/lib/notify'
import { useLang } from './LangContext'
import { useAuth } from './AuthContext'

/* ============================================================
   Satu sumber kebenaran untuk seluruh data aplikasi.
   Setiap perubahan: state -> localStorage -> (opsional) Google Drive.
   ============================================================ */

interface DataValue {
  data: AppData
  /* -- project / building -- */
  addProject: (input: { name: string; client: string; location: string }) => Project
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'client' | 'location'>>) => void
  deleteProject: (id: string) => void
  addBuilding: (projectId: string, input: { name: string; notes: string }) => Building | null
  updateBuilding: (
    ids: BuildingIds,
    patch: Partial<
      Pick<Building, 'name' | 'notes' | 'summaryClient' | 'targetSubmitDate' | 'targetSubmitStatus'>
    >,
  ) => void
  deleteBuilding: (projectId: string, buildingId: string) => void
  runReview: (ids: BuildingIds) => Promise<AiReview>
  /* -- task -- */
  addTask: (
    ids: BuildingIds,
    input: { title: string; description: string; dueDate: string | null },
  ) => Task | null
  updateTask: (ids: BuildingIds, taskId: string, patch: Partial<Task>) => void
  deleteTask: (ids: BuildingIds, taskId: string) => void
  toggleTask: (ids: BuildingIds, taskId: string) => void
  /* -- catatan (sticky note bebas) -- */
  addNote: (input: Partial<Pick<Note, 'title' | 'body' | 'color' | 'pinned'>>) => Note
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'color' | 'pinned' | 'archived' | 'collaborators'>>) => void
  deleteNote: (id: string) => void
  /* -- standard -- */
  addStandard: (note: Omit<StandardNote, 'id' | 'createdAt' | 'updatedAt'>) => StandardNote
  addStandards: (notes: StandardNote[]) => void
  updateStandard: (id: string, patch: Partial<StandardNote>) => void
  deleteStandard: (id: string) => void
  /* -- canvas board (diskusi team) -- */
  addBoard: (title: string) => CanvasBoard
  updateBoard: (id: string, patch: Partial<Pick<CanvasBoard, 'title' | 'scene'>>) => void
  deleteBoard: (id: string) => void
  /* -- warning -- */
  pushWarning: (w: Omit<Warning, 'id' | 'createdAt' | 'read'>) => void
  markWarningRead: (id: string) => void
  markAllWarningsRead: () => void
  clearWarnings: () => void
  unreadWarnings: number
  /* -- anggota (kolaborator) -- */
  upsertMember: (input: { name: string; email: string }) => void
  /* -- bulk -- */
  replaceAll: (data: AppData) => void
  resetAll: () => void
  syncing: boolean
  syncError: string | null
}

export interface BuildingIds {
  projectId: string
  buildingId: string
}

const DataContext = createContext<DataValue | null>(null)

/* ---------- helper pembuat entitas ---------- */

function makeBuilding(name: string, notes: string): Building {
  const stamp = nowISO()
  return {
    id: uid('bld'),
    name: name.trim(),
    notes: notes.trim(),
    summaryClient: '',
    lastReview: null,
    targetSubmitDate: null,
    targetSubmitStatus: 'belum',
    tasks: [],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Terapkan perubahan pada satu building tanpa memutasi state lama. */
function mapBuilding(data: AppData, ids: BuildingIds, fn: (b: Building) => Building): AppData {
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id !== ids.projectId
        ? p
        : {
            ...p,
            updatedAt: nowISO(),
            buildings: p.buildings.map((b) =>
              b.id !== ids.buildingId ? b : { ...fn(b), updatedAt: nowISO() },
            ),
          },
    ),
  }
}

export function findBuilding(
  data: AppData,
  ids: BuildingIds,
): { project: Project; building: Building } | null {
  const project = data.projects.find((p) => p.id === ids.projectId)
  if (!project) return null
  const building = project.buildings.find((b) => b.id === ids.buildingId)
  if (!building) return null
  return { project, building }
}

/* ---------- provider ---------- */

export function DataProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useLang()
  const { account } = useAuth()
  const [data, setData] = useState<AppData>(() => loadData())
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /*
   * Persist lokal — localStorage-primary.
   * Ditunda sesaat karena menulis berarti men-serialize SELURUH database
   * (termasuk gambar base64) secara sinkron. Kalau dijalankan tiap ketikan,
   * mengetik di task yang punya gambar terasa berat sekali.
   */
  useEffect(() => {
    const timer = setTimeout(() => saveData(data), 350)
    return () => clearTimeout(timer)
  }, [data])

  /* Jaring pengaman: paksa tulis saat tab ditutup/disembunyikan supaya
     ketikan terakhir dalam jendela debounce tidak ikut hilang. */
  const latest = useRef(data)
  latest.current = data
  useEffect(() => {
    const flush = () => saveData(latest.current)
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [])

  /* Backup ke Drive di-debounce, jadi ketikan cepat tidak memicu puluhan upload. */
  useEffect(() => {
    if (!isAutoSyncOn() || !isDriveConnected()) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      setSyncing(true)
      setSyncError(null)
      backupToDrive(data)
        .catch((err: unknown) => setSyncError(err instanceof Error ? err.message : 'sync-failed'))
        .finally(() => setSyncing(false))
    }, 4000)
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [data])

  /*
   * Auto-reconnect Drive: user yang pernah menyetujui akses Drive tidak
   * perlu klik "Sambungkan" lagi tiap buka app — token dipperbarui senyap.
   * Setelah berhasil, trigger sync ulang dengan memicu state re-render.
   */
  const reconnectRef = useRef(false)
  const [reconnectedAt, setReconnectedAt] = useState<ISODate | null>(null)
  useEffect(() => {
    if (reconnectRef.current) return
    reconnectRef.current = true
    if (isDriveConnected()) return
    void silentReconnect().then((ok) => {
      if (ok) setReconnectedAt(nowISO())
    })
    // Sengaja sekali per sesi app dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Setelah reconnect sukses, jalankan satu backup agar data terbaru langsung naik. */
  useEffect(() => {
    if (!reconnectedAt) return
    if (!isAutoSyncOn()) return
    setSyncing(true)
    backupToDrive(data)
      .then(() => setSyncError(null))
      .catch((err: unknown) => setSyncError(err instanceof Error ? err.message : 'sync-failed'))
      .finally(() => setSyncing(false))
    // Jalankan tepat sekali setiap reconnect sukses (data saat itu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectedAt])

  const mutate = useCallback((fn: (prev: AppData) => AppData) => {
    setData((prev) => ({ ...fn(prev), updatedAt: nowISO() }))
  }, [])

  /* Pemilik data juga masuk daftar anggota supaya bisa dipilih sebagai kolaborator. */
  const ownerRef = useRef(false)
  useEffect(() => {
    if (!account || ownerRef.current) return
    ownerRef.current = true
    upsertMember({ name: account.name, email: account.email })
    // Sengaja sekali per sesi: akun tidak berubah di tengah jalan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])

  /* ---------- canvas board ---------- */

  const addBoard = useCallback<DataValue['addBoard']>(
    (title) => {
      const stamp = nowISO()
      const board: CanvasBoard = {
        id: uid('brd'),
        title: title.trim() || 'Canvas',
        scene: { elements: [] },
        shareKey: uid('k').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12),
        createdAt: stamp,
        updatedAt: stamp,
      }
      mutate((prev) => ({ ...prev, boards: [board, ...prev.boards] }))
      return board
    },
    [mutate],
  )

  const updateBoard = useCallback<DataValue['updateBoard']>(
    (id, patch) => {
      mutate((prev) => ({
        ...prev,
        boards: prev.boards.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: nowISO() } : b)),
      }))
    },
    [mutate],
  )

  const deleteBoard = useCallback<DataValue['deleteBoard']>(
    (id) => {
      mutate((prev) => ({ ...prev, boards: prev.boards.filter((b) => b.id !== id) }))
    },
    [mutate],
  )

  /* ---------- warnings ---------- */

  const pushWarning = useCallback<DataValue['pushWarning']>(
    (w) => {
      setData((prev) => {
        // Dedup: warning dengan kunci sama cukup satu, yang lama dibuang.
        const rest = prev.warnings.filter((x) => x.dedupeKey !== w.dedupeKey)
        const warning: Warning = { ...w, id: uid('wrn'), createdAt: nowISO(), read: false }
        return { ...prev, warnings: [warning, ...rest].slice(0, 200), updatedAt: nowISO() }
      })
      void showNotification(w.title, w.body, { tag: w.dedupeKey, url: w.href })
    },
    [],
  )

  const markWarningRead = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      warnings: prev.warnings.map((w) => (w.id === id ? { ...w, read: true } : w)),
    }))
  }, [])

  const markAllWarningsRead = useCallback(() => {
    setData((prev) => ({ ...prev, warnings: prev.warnings.map((w) => ({ ...w, read: true })) }))
  }, [])

  const clearWarnings = useCallback(() => {
    setData((prev) => ({ ...prev, warnings: [] }))
  }, [])

  /* ---------- anggota (kolaborator) ---------- */

  /** Catat anggota baru / perbarui email kalau namanya sama. */
  const upsertMember = useCallback<DataValue['upsertMember']>(
    ({ name, email }) => {
      const clean = name.trim()
      if (!clean) return
      setData((prev) => {
        const existing = prev.members.find((m) => m.name.toLowerCase() === clean.toLowerCase())
        const member: Member = existing
          ? { ...existing, email: email || existing.email }
          : { name: clean, email, addedAt: nowISO() }
        const members = existing
          ? prev.members.map((m) => (m === existing ? member : m))
          : [...prev.members, member]
        return { ...prev, members }
      })
    },
    [],
  )

  /* Pindai target submit yang mendekat / lewat tenggat, sekali saat app dibuka. */
  const scannedRef = useRef(false)
  useEffect(() => {
    if (scannedRef.current) return
    scannedRef.current = true

    const pending: Omit<Warning, 'id' | 'createdAt' | 'read'>[] = []
    for (const project of data.projects) {
      for (const building of project.buildings) {
        if (building.targetSubmitStatus === 'sudah' || !building.targetSubmitDate) continue
        const left = daysUntil(building.targetSubmitDate)
        if (left === null || left > 7) continue
        const vars = { building: building.name, project: project.name, n: String(Math.abs(left)) }
        pending.push({
          severity: left < 0 ? 'critical' : 'warning',
          title: left < 0 ? t('common.overdue') : t('building.targetSubmit'),
          body: left < 0 ? t('warnings.overdue', vars) : t('warnings.dueSoon', vars),
          href: `/projects/${project.id}/buildings/${building.id}`,
          dedupeKey: `due:${building.id}:${building.targetSubmitDate}:${left < 0 ? 'over' : 'soon'}`,
        })
      }
    }
    pending.forEach(pushWarning)
    // Sengaja hanya jalan sekali per sesi; dependency lain akan membuatnya berulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- project / building ---------- */

  const addProject = useCallback<DataValue['addProject']>(
    (input) => {
      const stamp = nowISO()
      const project: Project = {
        id: uid('prj'),
        name: input.name.trim(),
        client: input.client.trim(),
        location: input.location.trim(),
        buildings: [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      mutate((prev) => ({ ...prev, projects: [project, ...prev.projects] }))
      return project
    },
    [mutate],
  )

  const updateProject = useCallback<DataValue['updateProject']>(
    (id, patch) => {
      mutate((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p)),
      }))
    },
    [mutate],
  )

  const deleteProject = useCallback<DataValue['deleteProject']>(
    (id) => {
      mutate((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }))
    },
    [mutate],
  )

  const addBuilding = useCallback<DataValue['addBuilding']>(
    (projectId, input) => {
      const building = makeBuilding(input.name, input.notes)
      let ok = false
      mutate((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => {
          if (p.id !== projectId) return p
          ok = true
          return { ...p, buildings: [...p.buildings, building], updatedAt: nowISO() }
        }),
      }))
      return ok ? building : null
    },
    [mutate],
  )

  const updateBuilding = useCallback<DataValue['updateBuilding']>(
    (ids, patch) => {
      mutate((prev) => mapBuilding(prev, ids, (b) => ({ ...b, ...patch })))
    },
    [mutate],
  )

  const deleteBuilding = useCallback<DataValue['deleteBuilding']>(
    (projectId, buildingId) => {
      mutate((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id !== projectId
            ? p
            : { ...p, updatedAt: nowISO(), buildings: p.buildings.filter((b) => b.id !== buildingId) },
        ),
      }))
    },
    [mutate],
  )

  /**
   * Inti flowchart: begitu SUMMARY CLIENT ditulis, AI membandingkannya dengan
   * CATATAN STANDARD lalu memunculkan WARNING kalau ada penyimpangan.
   */
  const runReview = useCallback<DataValue['runReview']>(
    async (ids) => {
      const found = findBuilding(data, ids)
      if (!found) throw new Error('building-not-found')
      if (!isAiReady()) throw new Error('missing-api-key')

      const review = await reviewSummary({
        summary: found.building.summaryClient,
        standards: data.standards,
        projectName: found.project.name,
        buildingName: found.building.name,
        lang,
      })

      mutate((prev) => mapBuilding(prev, ids, (b) => ({ ...b, lastReview: review })))

      const serious = review.findings.filter((f) => f.severity !== 'info')
      if (serious.length > 0) {
        pushWarning({
          severity: serious.some((f) => f.severity === 'critical') ? 'critical' : 'warning',
          title: `${found.project.name} — ${found.building.name}`,
          body: t('warnings.reviewFound', { n: serious.length, building: found.building.name }),
          href: `/projects/${ids.projectId}/buildings/${ids.buildingId}`,
          dedupeKey: `review:${ids.buildingId}:${review.id}`,
        })
      }
      return review
    },
    [data, lang, mutate, pushWarning, t],
  )

  /* ---------- task ---------- */

  const addTask = useCallback<DataValue['addTask']>(
    (ids, input) => {
      const stamp = nowISO()
      const task: Task = {
        id: uid('tsk'),
        title: input.title.trim(),
        description: input.description.trim(),
        status: 'belum',
        dueDate: input.dueDate,
        images: [],
        links: [],
        chat: [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      let ok = false
      mutate((prev) =>
        mapBuilding(prev, ids, (b) => {
          ok = true
          return { ...b, tasks: [...b.tasks, task] }
        }),
      )
      return ok ? task : null
    },
    [mutate],
  )

  const updateTask = useCallback<DataValue['updateTask']>(
    (ids, taskId, patch) => {
      mutate((prev) =>
        mapBuilding(prev, ids, (b) => ({
          ...b,
          tasks: b.tasks.map((task) =>
            task.id === taskId ? { ...task, ...patch, id: task.id, updatedAt: nowISO() } : task,
          ),
        })),
      )
    },
    [mutate],
  )

  const deleteTask = useCallback<DataValue['deleteTask']>(
    (ids, taskId) => {
      mutate((prev) =>
        mapBuilding(prev, ids, (b) => ({ ...b, tasks: b.tasks.filter((task) => task.id !== taskId) })),
      )
    },
    [mutate],
  )

  const toggleTask = useCallback<DataValue['toggleTask']>(
    (ids, taskId) => {
      mutate((prev) =>
        mapBuilding(prev, ids, (b) => ({
          ...b,
          tasks: b.tasks.map((task) => {
            if (task.id !== taskId) return task
            const status: DoneStatus = task.status === 'sudah' ? 'belum' : 'sudah'
            return { ...task, status, updatedAt: nowISO() }
          }),
        })),
      )
    },
    [mutate],
  )

  /* ---------- catatan (sticky note bebas) ---------- */

  const addNote = useCallback<DataValue['addNote']>(
    (input) => {
      const stamp = nowISO()
      const note: Note = {
        id: uid('nt'),
        title: (input.title ?? '').trim(),
        body: input.body ?? '',
        color: input.color ?? null,
        pinned: input.pinned ?? false,
        archived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }
      mutate((prev) => ({ ...prev, notes: [note, ...prev.notes] }))
      return note
    },
    [mutate],
  )

  const updateNote = useCallback<DataValue['updateNote']>(
    (id, patch) => {
      mutate((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id ? { ...n, ...patch, id: n.id, updatedAt: nowISO() } : n,
        ),
      }))
    },
    [mutate],
  )

  const deleteNote = useCallback<DataValue['deleteNote']>(
    (id) => {
      mutate((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }))
    },
    [mutate],
  )

  /* ---------- standard ---------- */

  const addStandard = useCallback<DataValue['addStandard']>(
    (note) => {
      const stamp = nowISO()
      const full: StandardNote = { ...note, id: uid('std'), createdAt: stamp, updatedAt: stamp }
      mutate((prev) => ({ ...prev, standards: [full, ...prev.standards] }))
      return full
    },
    [mutate],
  )

  const addStandards = useCallback<DataValue['addStandards']>(
    (notes) => {
      if (notes.length === 0) return
      mutate((prev) => ({ ...prev, standards: [...notes, ...prev.standards] }))
    },
    [mutate],
  )

  const updateStandard = useCallback<DataValue['updateStandard']>(
    (id, patch) => {
      mutate((prev) => ({
        ...prev,
        standards: prev.standards.map((s) =>
          s.id === id ? { ...s, ...patch, id: s.id, updatedAt: nowISO() } : s,
        ),
      }))
    },
    [mutate],
  )

  const deleteStandard = useCallback<DataValue['deleteStandard']>(
    (id) => {
      mutate((prev) => ({ ...prev, standards: prev.standards.filter((s) => s.id !== id) }))
    },
    [mutate],
  )

  /* ---------- bulk ---------- */

  const replaceAll = useCallback((next: AppData) => setData(migrate(next)), [])
  const resetAll = useCallback(() => setData(emptyData()), [])

  const unreadWarnings = useMemo(() => data.warnings.filter((w) => !w.read).length, [data.warnings])

  const value = useMemo<DataValue>(
    () => ({
      data,
      addProject,
      updateProject,
      deleteProject,
      addBuilding,
      updateBuilding,
      deleteBuilding,
      runReview,
      addTask,
      updateTask,
      deleteTask,
      toggleTask,
      addNote,
      updateNote,
      deleteNote,
      addBoard,
      updateBoard,
      deleteBoard,
      addStandard,
      addStandards,
      updateStandard,
      deleteStandard,
      pushWarning,
      markWarningRead,
      markAllWarningsRead,
      clearWarnings,
      unreadWarnings,
      upsertMember,
      replaceAll,
      resetAll,
      syncing,
      syncError,
    }),
    [
      data, addProject, updateProject, deleteProject, addBuilding, updateBuilding, deleteBuilding,
      runReview, addTask, updateTask, deleteTask, toggleTask, addNote, updateNote, deleteNote,
      addBoard, updateBoard, deleteBoard,
      addStandard, addStandards,
      updateStandard, deleteStandard, pushWarning, markWarningRead, markAllWarningsRead, clearWarnings,
      unreadWarnings, upsertMember, replaceAll, resetAll, syncing, syncError,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData harus dipakai di dalam DataProvider')
  return ctx
}

export type { ChatMessage }
