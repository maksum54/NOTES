import type { AppData } from '@/types'
import { readRaw, removeRaw, writeRaw } from './storage'

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

/** Buka consent popup Google dan simpan access token. */
export async function connectDrive(interactive = true): Promise<void> {
  if (!isDriveConfigured()) throw new Error('drive-not-configured')
  const accounts = await loadGis()

  await new Promise<void>((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'no-access-token'))
          return
        }
        writeRaw(
          'driveToken',
          JSON.stringify({
            accessToken: resp.access_token,
            expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
          } satisfies StoredToken),
        )
        resolve()
      },
    })
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export async function disconnectDrive(): Promise<void> {
  const token = readToken()
  removeRaw('driveToken')
  removeRaw('driveFileId')
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
