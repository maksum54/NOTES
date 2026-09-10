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
  AREA_KINDS,
  emptyData,
  type AiReview,
  type AppData,
  type Area,
  type AreaKind,
  type Building,
  type ChatMessage,
  type DoneStatus,
  type Project,
  type StandardNote,
  type Task,
  type Warning,
} from '@/types'
import { loadData, migrate, saveData } from '@/lib/storage'
import { daysUntil, nowISO, uid } from '@/lib/utils'
import { reviewSummary, isAiReady } from '@/lib/ai'
import { backupToDrive, isAutoSyncOn, isDriveConnected } from '@/lib/drive'
import { showNotification } from '@/lib/notify'
import { useLang } from './LangContext'

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
    projectId: string,
    buildingId: string,
    patch: Partial<Pick<Building, 'name' | 'notes'>>,
  ) => void
  deleteBuilding: (projectId: string, buildingId: string) => void
  /* -- area -- */
  updateArea: (
    ids: AreaIds,
    patch: Partial<Pick<Area, 'summaryClient' | 'targetSubmitDate' | 'targetSubmitStatus'>>,
  ) => void
  runReview: (ids: AreaIds) => Promise<AiReview>
  /* -- task -- */
  addTask: (ids: AreaIds, input: { title: string; description: string; dueDate: string | null }) => Task | null
  updateTask: (ids: AreaIds, taskId: string, patch: Partial<Task>) => void
  deleteTask: (ids: AreaIds, taskId: string) => void
  toggleTask: (ids: AreaIds, taskId: string) => void
  /* -- standard -- */
  addStandard: (note: Omit<StandardNote, 'id' | 'createdAt' | 'updatedAt'>) => StandardNote
  addStandards: (notes: StandardNote[]) => void
  updateStandard: (id: string, patch: Partial<StandardNote>) => void
  deleteStandard: (id: string) => void
  /* -- warning -- */
  pushWarning: (w: Omit<Warning, 'id' | 'createdAt' | 'read'>) => void
  markWarningRead: (id: string) => void
  markAllWarningsRead: () => void
  clearWarnings: () => void
  unreadWarnings: number
  /* -- bulk -- */
  replaceAll: (data: AppData) => void
  resetAll: () => void
  syncing: boolean
  syncError: string | null
}

export interface AreaIds {
  projectId: string
  buildingId: string
  areaId: string
}

const DataContext = createContext<DataValue | null>(null)

/* ---------- helper pembuat entitas ---------- */

function makeArea(kind: AreaKind): Area {
  return {
    id: uid('area'),
    kind,
    summaryClient: '',
    lastReview: null,
    targetSubmitDate: null,
    targetSubmitStatus: 'belum',
    tasks: [],
    updatedAt: nowISO(),
  }
}

function makeBuilding(name: string, notes: string): Building {
  const stamp = nowISO()
  return {
    id: uid('bld'),
    name: name.trim(),
    notes: notes.trim(),
    // Setiap building selalu punya tiga area sesuai flowchart.
    areas: AREA_KINDS.map(makeArea),
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Terapkan perubahan pada satu area tanpa memutasi state lama. */
function mapArea(data: AppData, ids: AreaIds, fn: (area: Area) => Area): AppData {
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id !== ids.projectId
        ? p
        : {
            ...p,
            updatedAt: nowISO(),
            buildings: p.buildings.map((b) =>
              b.id !== ids.buildingId
                ? b
                : {
                    ...b,
                    updatedAt: nowISO(),
                    areas: b.areas.map((a) => (a.id !== ids.areaId ? a : { ...fn(a), updatedAt: nowISO() })),
                  },
            ),
          },
    ),
  }
}

export function findArea(
  data: AppData,
  ids: AreaIds,
): { project: Project; building: Building; area: Area } | null {
  const project = data.projects.find((p) => p.id === ids.projectId)
  if (!project) return null
  const building = project.buildings.find((b) => b.id === ids.buildingId)
  if (!building) return null
  const area = building.areas.find((a) => a.id === ids.areaId)
  if (!area) return null
  return { project, building, area }
}

/* ---------- provider ---------- */

export function DataProvider({ children }: { children: ReactNode }) {
  const { t, lang } = useLang()
  const [data, setData] = useState<AppData>(() => loadData())
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /* Persist lokal setiap kali data berubah — localStorage-primary. */
  useEffect(() => {
    saveData(data)
  }, [data])

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

  const mutate = useCallback((fn: (prev: AppData) => AppData) => {
    setData((prev) => ({ ...fn(prev), updatedAt: nowISO() }))
  }, [])

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

  /* Pindai target submit yang mendekat / lewat tenggat, sekali saat app dibuka. */
  const scannedRef = useRef(false)
  useEffect(() => {
    if (scannedRef.current) return
    scannedRef.current = true

    const pending: Omit<Warning, 'id' | 'createdAt' | 'read'>[] = []
    for (const project of data.projects) {
      for (const building of project.buildings) {
        for (const area of building.areas) {
          if (area.targetSubmitStatus === 'sudah' || !area.targetSubmitDate) continue
          const left = daysUntil(area.targetSubmitDate)
          if (left === null || left > 7) continue
          const areaLabel = t(`areas.${area.kind}`)
          const href = `/projects/${project.id}/buildings/${building.id}/areas/${area.id}`
          const vars = { area: areaLabel, building: building.name, n: String(Math.abs(left)) }
          pending.push({
            severity: left < 0 ? 'critical' : 'warning',
            title: left < 0 ? t('common.overdue') : t('areas.targetSubmit'),
            body: left < 0 ? t('warnings.overdue', vars) : t('warnings.dueSoon', vars),
            href,
            dedupeKey: `due:${area.id}:${area.targetSubmitDate}:${left < 0 ? 'over' : 'soon'}`,
          })
        }
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
    (projectId, buildingId, patch) => {
      mutate((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id !== projectId
            ? p
            : {
                ...p,
                updatedAt: nowISO(),
                buildings: p.buildings.map((b) =>
                  b.id === buildingId ? { ...b, ...patch, updatedAt: nowISO() } : b,
                ),
              },
        ),
      }))
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

  /* ---------- area ---------- */

  const updateArea = useCallback<DataValue['updateArea']>(
    (ids, patch) => {
      mutate((prev) => mapArea(prev, ids, (area) => ({ ...area, ...patch })))
    },
    [mutate],
  )

  /**
   * Inti flowchart: begitu SUMMARY CLIENT ditulis, AI membandingkannya dengan
   * CATATAN STANDARD lalu memunculkan WARNING kalau ada penyimpangan.
   */
  const runReview = useCallback<DataValue['runReview']>(
    async (ids) => {
      const found = findArea(data, ids)
      if (!found) throw new Error('area-not-found')
      if (!isAiReady()) throw new Error('missing-api-key')

      const areaLabel = t(`areas.${found.area.kind}`)
      const review = await reviewSummary({
        summary: found.area.summaryClient,
        standards: data.standards,
        projectName: found.project.name,
        buildingName: found.building.name,
        areaLabel,
        lang,
      })

      mutate((prev) => mapArea(prev, ids, (area) => ({ ...area, lastReview: review })))

      const serious = review.findings.filter((f) => f.severity !== 'info')
      if (serious.length > 0) {
        pushWarning({
          severity: serious.some((f) => f.severity === 'critical') ? 'critical' : 'warning',
          title: `${found.building.name} — ${areaLabel}`,
          body: t('warnings.reviewFound', { n: serious.length, area: areaLabel }),
          href: `/projects/${ids.projectId}/buildings/${ids.buildingId}/areas/${ids.areaId}`,
          dedupeKey: `review:${ids.areaId}:${review.id}`,
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
        mapArea(prev, ids, (area) => {
          ok = true
          return { ...area, tasks: [...area.tasks, task] }
        }),
      )
      return ok ? task : null
    },
    [mutate],
  )

  const updateTask = useCallback<DataValue['updateTask']>(
    (ids, taskId, patch) => {
      mutate((prev) =>
        mapArea(prev, ids, (area) => ({
          ...area,
          tasks: area.tasks.map((task) =>
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
        mapArea(prev, ids, (area) => ({ ...area, tasks: area.tasks.filter((task) => task.id !== taskId) })),
      )
    },
    [mutate],
  )

  const toggleTask = useCallback<DataValue['toggleTask']>(
    (ids, taskId) => {
      mutate((prev) =>
        mapArea(prev, ids, (area) => ({
          ...area,
          tasks: area.tasks.map((task) => {
            if (task.id !== taskId) return task
            const status: DoneStatus = task.status === 'sudah' ? 'belum' : 'sudah'
            return { ...task, status, updatedAt: nowISO() }
          }),
        })),
      )
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
      updateArea,
      runReview,
      addTask,
      updateTask,
      deleteTask,
      toggleTask,
      addStandard,
      addStandards,
      updateStandard,
      deleteStandard,
      pushWarning,
      markWarningRead,
      markAllWarningsRead,
      clearWarnings,
      unreadWarnings,
      replaceAll,
      resetAll,
      syncing,
      syncError,
    }),
    [
      data, addProject, updateProject, deleteProject, addBuilding, updateBuilding, deleteBuilding,
      updateArea, runReview, addTask, updateTask, deleteTask, toggleTask, addStandard, addStandards,
      updateStandard, deleteStandard, pushWarning, markWarningRead, markAllWarningsRead, clearWarnings,
      unreadWarnings, replaceAll, resetAll, syncing, syncError,
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
