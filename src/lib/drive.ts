import type { AppData } from '@/types'
import { readRaw, removeRaw, writeRaw } from './storage'
import { mergeData } from './merge'

/* ============================================================
   STORAGE GOOGLE DRIVE
   Memakai Google Identity Services (GIS) token client + Drive REST v3.
   Scope drive.file: app hanya bisa menyentuh file yang dia buat sendiri,
   bukan seluruh isi Drive user.
   ============================================================ */

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const BACKUP_NAME = 'notes-backup.json'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.trim().length > 0
}

/* ---------- tipe minimal Google Identity Services ---------- */

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: {
      client_id: string
      scope: string
      prompt?: string
      callback: (resp: TokenResponse) => void
    }): TokenClient
    revoke(token: string, done: () => void): void
  }
}
declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts }
  }
}

let gisPromise: Promise<GoogleAccounts> | null = null

function loadGis(): Promise<GoogleAccounts> {
  if (window.google?.accounts) return Promise.resolve(window.google.accounts)
  if (gisPromise) return gisPromise

  gisPromise = new Promise<GoogleAccounts>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const onReady = () => {
      if (window.google?.accounts) resolve(window.google.accounts)
      else reject(new Error('gis-unavailable'))
    }
    if (existing) {
      existing.addEventListener('load', onReady)
      existing.addEventListener('error', () => reject(new Error('gis-load-failed')))
      if (window.google?.accounts) onReady()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = onReady
    script.onerror = () => reject(new Error('gis-load-failed'))
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    gisPromise = null
    throw err
  })

  return gisPromise
}

/* ---------- pemberitahuan perubahan status ----------
   Halaman (Storage, Pengaturan) perlu tahu saat token datang/hilang, bukan
   memotret status sekali saat mount — kalau memotret, halaman yang dibuka
   selagi reconnect senyap masih jalan akan terus bilang "belum tersambung". */

type DriveListener = () => void
const driveListeners = new Set<DriveListener>()

export function subscribeDrive(listener: DriveListener): () => void {
  driveListeners.add(listener)
  return () => {
    driveListeners.delete(listener)
  }
}

function emitDrive(): void {
  driveListeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* satu listener rusak tidak boleh menjatuhkan yang lain */
    }
  })
}

/* ---------- token ---------- */

interface StoredToken {
  accessToken: string
  expiresAt: number
}

function readToken(): StoredToken | null {
  const raw = readRaw('driveToken')
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as StoredToken
    // Anggap kedaluwarsa 60 detik lebih awal supaya tidak kepotong di tengah upload.
    return t.expiresAt - 60_000 > Date.now() ? t : null
  } catch {
    return null
  }
}

export function isDriveConnected(): boolean {
  return readToken() !== null
}

export function driveLastSync(): string | null {
  return readRaw('driveLastSync')
}

export function isAutoSyncOn(): boolean {
  return readRaw('driveAuto') === '1'
}

export function setAutoSync(on: boolean): void {
  writeRaw('driveAuto', on ? '1' : '0')
}

/**
 * Pernah tersambung = user setidaknya sekali menyetujui akses Drive.
 * Setelah itu app boleh memperbarui token otomatis (tanpa consent) tiap dibuka.
 */
export function wasEverConnected(): boolean {
  // User pernah menekan "Putuskan": izinnya sudah dicabut di Google, jadi
  // app TIDAK boleh menyambung sendiri lagi sampai dia menyambungkan manual
  // (atau login Google lagi, yang memang menampilkan consent).
  if (readRaw('driveOptOut') === '1') return false
  if (readRaw('driveEverConnected') === '1') return true
  // Login Google sekalian memberi izin Drive, jadi akun Google boleh mencoba
  // memperbarui token tanpa consent walau penanda di atas hilang (mis.
  // localStorage sempat dibersihkan sebagian atau dipasang di perangkat baru).
  try {
    const raw = readRaw('auth')
    return raw !== null && (JSON.parse(raw) as { mode?: string }).mode === 'google'
  } catch {
    return false
  }
}

/**
 * Auto-reconnect senyap: hanya jalan kalau user sudah pernah connect dan
 * token sedang tidak ada/kedaluwarsa. Popup Google TIDAK muncul (prompt '').
 * Gagal (offline, browser blokir popup) dianggap tidak fatal.
 */
let silentInFlight: Promise<boolean> | null = null

export function silentReconnect(): Promise<boolean> {
  if (!isDriveConfigured()) return Promise.resolve(false)
  if (isDriveConnected()) return Promise.resolve(true)
  if (!wasEverConnected()) return Promise.resolve(false)
  // Beberapa tempat (DataContext + halaman Storage/Pengaturan) bisa memintanya
  // bersamaan; satu permintaan token saja sudah cukup untuk semuanya.
  if (silentInFlight) return silentInFlight
  silentInFlight = connectDrive(false)
    .then(() => isDriveConnected())
    .catch(() => false)
    .finally(() => {
      silentInFlight = null
    })
  return silentInFlight
}

/** Buka consent popup Google dan simpan access token. */
export async function connectDrive(interactive = true): Promise<void> {
  if (!isDriveConfigured()) throw new Error('drive-not-configured')
  const accounts = await loadGis()

  const request = (prompt: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const client = accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || 'no-access-token'))
            return
          }
          writeRaw('driveEverConnected', '1')
          writeRaw(
            'driveToken',
            JSON.stringify({
              accessToken: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
            } satisfies StoredToken),
          )
          // User menyambungkan lagi setelah menekan "Putuskan" -> pencabutan
          // itu tidak berlaku lagi.
          removeRaw('driveOptOut')
          emitDrive()
          resolve()
        },
      })
      client.requestAccessToken({ prompt })
    })

  // User sudah pernah menyetujui akses Drive -> minta token SENYAP dulu
  // (tanpa popup), supaya login berikutnya tidak muncul layar izin lagi.
  // Kalau senyap gagal (mis. sesi Google habis) dan panggilan ini interaktif,
  // barulah tampilkan layar consent.
  if (wasEverConnected()) {
    try {
      await request('')
      return
    } catch {
      if (!interactive) throw new Error('drive-silent-failed')
    }
  }
  await request('consent')
}

/**
 * Lupakan sesi Drive di PERANGKAT ini tanpa mencabut izin Google. Dipakai saat
 * logout: izin tetap berlaku, jadi login berikutnya tersambung sendiri tanpa
 * layar consent. (Mencabut izin saat logout justru memaksa user menyetujui
 * ulang tiap kali masuk.)
 */
export function forgetDriveSession(): void {
  removeRaw('driveToken')
  removeRaw('driveFileId')
  removeRaw('driveStorageFolderId')
  emitDrive()
}

/** Putuskan sungguhan: token dicabut di Google dan izinnya dilepas. */
export async function disconnectDrive(): Promise<void> {
  const token = readToken()
  forgetDriveSession()
  // Izin dicabut di sisi Google, jadi penandanya ikut dibuang — permintaan
  // token senyap pasti ditolak sampai user menyetujui lagi. Penanda opt-out
  // disimpan (bukan sekadar variabel di memori) supaya reload halaman tidak
  // menyambungkan ulang diam-diam.
  removeRaw('driveEverConnected')
  writeRaw('driveOptOut', '1')
  if (!token) return
  try {
    const accounts = await loadGis()
    await new Promise<void>((resolve) => accounts.oauth2.revoke(token.accessToken, resolve))
  } catch {
    /* token lokal sudah dibuang, cukup */
  }
}

async function authHeader(): Promise<Record<string, string>> {
  let token = readToken()
  if (!token) {
    // Token habis: minta ulang tanpa consent screen kalau bisa.
    await connectDrive(false)
    token = readToken()
  }
  if (!token) throw new Error('drive-not-connected')
  return { Authorization: `Bearer ${token.accessToken}` }
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(await authHeader()), ...(init.headers as Record<string, string> | undefined) }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 || res.status === 403) {
    removeRaw('driveToken')
    emitDrive()
    throw new Error('drive-unauthorized')
  }
  return res
}

/* ---------- backup file ---------- */

interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
}

async function findBackupFile(): Promise<DriveFile | null> {
  const cached = readRaw('driveFileId')
  if (cached) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${cached}?fields=id,name,modifiedTime,trashed`,
    )
    if (res.ok) {
      const file = (await res.json()) as DriveFile & { trashed?: boolean }
      if (!file.trashed) return file
    }
    removeRaw('driveFileId')
  }

  const query = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`)
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`,
  )
  if (!res.ok) throw new Error(`drive-list-failed-${res.status}`)
  const json = (await res.json()) as { files?: DriveFile[] }
  const file = json.files?.[0] ?? null
  if (file) writeRaw('driveFileId', file.id)
  return file
}

/** Unggah seluruh AppData sebagai satu file JSON di Drive user. */
export async function backupToDrive(data: AppData): Promise<void> {
  const existing = await findBackupFile()
  const metadata = {
    name: BACKUP_NAME,
    mimeType: 'application/json',
    ...(existing ? {} : { description: 'Backup otomatis aplikasi NOTES' }),
  }

  const boundary = `notes${Math.random().toString(36).slice(2)}`
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(data)}\r\n` +
    `--${boundary}--`

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id'

  const res = await driveFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`drive-upload-failed-${res.status}`)

  const json = (await res.json()) as { id?: string }
  if (json.id) writeRaw('driveFileId', json.id)
  writeRaw('driveLastSync', new Date().toISOString())
}

/** Ambil backup terakhir. null berarti belum ada file backup di Drive. */
export async function restoreFromDrive(): Promise<AppData | null> {
  const file = await findBackupFile()
  if (!file) return null
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  if (!res.ok) throw new Error(`drive-download-failed-${res.status}`)
  const data = (await res.json()) as AppData
  writeRaw('driveLastSync', new Date().toISOString())
  return data
}

/**
 * Sinkron dua-arah: tarik backup Drive, GABUNGKAN dengan data lokal
 * (per-item, terbaru menang — lihat lib/merge), lalu unggah hasilnya.
 * Aman dipanggil dari dua perangkat: data kedua sisi tetap hidup.
 * Mengembalikan hasil gabungan; null berarti Drive belum punya backup.
 */
export async function syncMergeWithDrive(local: AppData): Promise<AppData | null> {
  const remote = await restoreFromDrive()
  if (!remote) {
    // Belum ada backup: perangkat ini yang memulai — naikkan datanya.
    await backupToDrive(local)
    return local
  }
  const merged = mergeData(local, remote)
  await backupToDrive(merged)
  return merged
}

/* ============================================================
   STORAGE PRIBADI — folder "NOTES Storage" di Drive user.
   Upload/download file apa saja (zip, excel, dokumen, dll).
   Scope tetap drive.file: folder ini dibuat oleh app, jadi
   hanya folder ini (bukan seluruh Drive) yang bisa disentuh.
   ============================================================ */

export const STORAGE_FOLDER_NAME = 'NOTES Storage'

interface DriveNode {
  id: string
  name: string
  mimeType?: string
  size?: string
  modifiedTime?: string
}

async function folderStillExists(id: string): Promise<boolean> {
  try {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`,
    )
    if (!res.ok) return false
    const json = (await res.json()) as { trashed?: boolean }
    return !json.trashed
  } catch {
    return false
  }
}

/** Ambil (atau buat) folder NOTES Storage di root Drive user. */
export async function ensureStorageFolder(): Promise<string> {
  const cached = readRaw('driveStorageFolderId')
  if (cached && (await folderStillExists(cached))) return cached

  const query = encodeURIComponent(
    `name='${STORAGE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`,
  )
  if (!res.ok) throw new Error(`drive-list-failed-${res.status}`)
  const json = (await res.json()) as { files?: { id: string }[] }

  let id = json.files?.[0]?.id
  if (!id) {
    const create = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: STORAGE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
    if (!create.ok) throw new Error(`drive-folder-failed-${create.status}`)
    id = ((await create.json()) as { id?: string }).id
  }
  if (!id) throw new Error('drive-folder-missing')
  writeRaw('driveStorageFolderId', id)
  return id
}

export interface StorageFile {
  id: string
  name: string
  size: number
  mimeType: string
  modifiedTime: string
}

/** Daftar file di dalam folder NOTES Storage. */
export async function listStorageFiles(): Promise<StorageFile[]> {
  const folderId = await ensureStorageFolder()
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}` +
      `&fields=files(id,name,size,mimeType,modifiedTime)&pageSize=200&orderBy=modifiedTime desc`,
  )
  if (!res.ok) throw new Error(`drive-list-failed-${res.status}`)
  const json = (await res.json()) as { files?: DriveNode[] }
  return (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    mimeType: f.mimeType ?? 'application/octet-stream',
    modifiedTime: f.modifiedTime ?? '',
  }))
}

/**
 * Unggah satu file ke folder NOTES Storage memakai resumable upload,
 * supaya ukuran bebas (zip besar pun jalan) dan tahan jaringan kurang stabil.
 */
export async function uploadStorageFile(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (pct: number) => void } = {},
): Promise<void> {
  const folderId = await ensureStorageFolder()

  const init = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: file.name, parents: [folderId] }),
      signal: opts.signal,
    },
  )
  if (!init.ok) throw new Error(`drive-upload-failed-${init.status}`)
  const uploadUrl = init.headers.get('location') ?? init.headers.get('Location')
  if (!uploadUrl) throw new Error('drive-upload-no-url')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`drive-upload-failed-${xhr.status}`)))
    xhr.onerror = () => reject(new Error('network-error'))
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

/** Unduh satu file dari NOTES Storage lalu simpan ke perangkat. */
export async function downloadStorageFile(file: StorageFile): Promise<void> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  if (!res.ok) throw new Error(`drive-download-failed-${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Hapus satu file dari NOTES Storage (pindah ke trash Drive). */
export async function deleteStorageFile(id: string): Promise<void> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error(`drive-delete-failed-${res.status}`)
}

/** Kuota Drive user — null kalau Google tidak mengizinkan membacanya. */
export interface DriveQuota {
  limitBytes: number | null
  usedBytes: number
}

export async function driveQuota(): Promise<DriveQuota | null> {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota')
  if (!res.ok) return null
  const json = (await res.json()) as { storageQuota?: { limit?: string; usage?: string } }
  const q = json.storageQuota
  if (!q) return null
  return {
    limitBytes: q.limit ? Number(q.limit) : null,
    usedBytes: Number(q.usage ?? 0),
  }
}
