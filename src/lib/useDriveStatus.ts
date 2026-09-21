import { useEffect, useState } from 'react'
import {
  isDriveConfigured,
  isDriveConnected,
  silentReconnect,
  subscribeDrive,
  wasEverConnected,
} from '@/lib/drive'

/**
 * STATUS SAMBUNGAN DRIVE UNTUK HALAMAN.
 *
 * Halaman Storage & Pengaturan dulu memotret `isDriveConnected()` sekali saat
 * mount. Padahal token Google cuma berumur ~1 jam dan diperbarui SENYAP saat
 * app dibuka — halaman yang kebetulan dibuka sebelum perbaruan itu selesai
 * akan terus bilang "belum tersambung" dan menyuruh user menyambung manual,
 * walau izinnya sudah lama diberikan.
 *
 * Hook ini:
 *  - mengikuti perubahan token dari mana pun (subscribeDrive),
 *  - dan kalau tokennya memang belum ada padahal user sudah pernah menyetujui,
 *    memperbaruinya sendiri tanpa popup.
 *
 * Tombol "Sambungkan" baru muncul kalau upaya senyap itu benar-benar gagal
 * (belum pernah menyetujui, izin dicabut, atau sesi Google habis).
 */
export type DriveStatus =
  /** VITE_GOOGLE_CLIENT_ID belum diisi — fitur Drive mati. */
  | 'unconfigured'
  /** Sedang memperbarui token tanpa popup. */
  | 'connecting'
  | 'connected'
  /** Perlu tindakan user: klik "Sambungkan Google Drive". */
  | 'disconnected'

export interface DriveStatusValue {
  status: DriveStatus
  connected: boolean
  /** Baca ulang status sekarang (mis. setelah aksi manual). */
  refresh: () => void
}

function snapshot(): DriveStatus {
  if (!isDriveConfigured()) return 'unconfigured'
  if (isDriveConnected()) return 'connected'
  return wasEverConnected() ? 'connecting' : 'disconnected'
}

export function useDriveStatus(): DriveStatusValue {
  const [status, setStatus] = useState<DriveStatus>(snapshot)

  /* Token datang/hilang di tempat lain (sync otomatis, halaman lain, 401). */
  useEffect(() => subscribeDrive(() => setStatus(snapshot())), [])

  /* Belum ada token tapi izinnya sudah pernah diberikan -> perbarui senyap. */
  useEffect(() => {
    if (status !== 'connecting') return
    let alive = true
    void silentReconnect().then((ok) => {
      if (alive) setStatus(ok ? snapshot() : 'disconnected')
    })
    return () => {
      alive = false
    }
  }, [status])

  return { status, connected: status === 'connected', refresh: () => setStatus(snapshot()) }
}
