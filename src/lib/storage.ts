import { DATA_VERSION, emptyData, type AppData } from '@/types'

/**
 * Pola localStorage-primary: data utama hidup di perangkat, Google Drive
 * hanya lapisan sinkron. Kalau Drive/AI mati, app tetap jalan penuh.
 */
const KEYS = {
  data: 'notes.data',
  theme: 'notes.theme',
  lang: 'notes.lang',
  auth: 'notes.auth',
  aiKey: 'notes.ai.key',
  aiModel: 'notes.ai.model',
  aiBaseUrl: 'notes.ai.baseUrl',
  driveToken: 'notes.drive.token',
  driveFileId: 'notes.drive.fileId',
  driveStorageFolderId: 'notes.drive.storageFolderId',
  driveLastSync: 'notes.drive.lastSync',
  driveAuto: 'notes.drive.auto',
  assistantChat: 'notes.assistant.chat',
  installDismissed: 'notes.install.dismissed',
} as const

export type StorageKey = keyof typeof KEYS

export function readRaw(key: StorageKey): string | null {
  try {
    return localStorage.getItem(KEYS[key])
  } catch {
    return null
  }
}

export function writeRaw(key: StorageKey, value: string): void {
  try {
    localStorage.setItem(KEYS[key], value)
  } catch (err) {
    console.warn('[storage] gagal menulis', key, err)
  }
}

export function removeRaw(key: StorageKey): void {
  try {
    localStorage.removeItem(KEYS[key])
  } catch {
    /* diamkan */
  }
}

export function readJSON<T>(key: StorageKey, fallback: T): T {
  const raw = readRaw(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(key: StorageKey, value: unknown): void {
  writeRaw(key, JSON.stringify(value))
}

/**
 * Isi ulang field yang hilang supaya data lama tetap kompatibel.
 *
 * v1 -> v2: building dulu punya tiga area tetap (finish good / raw material /
 * utility) yang menyimpan summary, target submit, dan task. Sekarang building
 * sendiri yang menyimpannya. Bentuk project lama tidak kompatibel, jadi
 * project dibuang dan warning ikut dibersihkan karena menunjuk rute mati.
 * Catatan standard TIDAK terpengaruh perubahan ini, jadi tetap dipertahankan.
 */
export function migrate(input: unknown): AppData {
  const base = emptyData()
  if (!input || typeof input !== 'object') return base
  const d = input as Partial<AppData> & { version?: number }

  const standards = Array.isArray(d.standards) ? d.standards : []
  const outdated = typeof d.version !== 'number' || d.version < DATA_VERSION

  if (outdated) {
    return { ...base, standards, updatedAt: new Date().toISOString() }
  }

  return {
    version: DATA_VERSION,
    projects: Array.isArray(d.projects) ? d.projects : [],
    standards,
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
    boards: Array.isArray(d.boards) ? d.boards : [],
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : base.updatedAt,
  }
}

export function loadData(): AppData {
  return migrate(readJSON<unknown>('data', null))
}

export function saveData(data: AppData): void {
  writeJSON('data', data)
}

export function storageBytes(): number {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('notes.')) continue
      total += k.length + (localStorage.getItem(k)?.length ?? 0)
    }
    return total * 2 // UTF-16
  } catch {
    return 0
  }
}

export function clearAppStorage(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith('notes.')) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* diamkan */
  }
}
