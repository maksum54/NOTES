/**
 * DAFTAR POPUP YANG DI-PIN (maksimal dua: slot ATAS & BAWAH).
 *
 * Dulu hanya ada satu record `pinnedPopup`, jadi pin berikutnya menimpa yang
 * lama. Sekarang catatan/task bisa menempel berdua: satu di slot atas, satu
 * di slot bawah — baik saat melayang di halaman maupun saat dilepas ke
 * jendela sticky (di sana keduanya ditumpuk sesuai slot).
 *
 * Pin ketiga tidak ditolak, tapi popup yang PALING LAMA menempel dilepas dari
 * daftar. Catatannya sendiri tidak diutak-atik — statusnya tetap "pinned" di
 * halaman Catatan, hanya popup melayangnya yang berhenti.
 */

import { readRaw, removeRaw, writeRaw } from '@/lib/storage'

/** Banyaknya popup yang boleh menempel sekaligus. */
export const MAX_PINNED_POPUPS = 2

export type PinSlot = 'top' | 'bottom'

/** Urutan pemakaian slot: popup pertama di bawah (seperti perilaku lama),
 *  popup kedua di atas supaya keduanya tidak saling menutupi. */
const SLOT_ORDER: PinSlot[] = ['bottom', 'top']

export interface PinnedRecord {
  /** "note:<id>" atau "task:<id>" — sama dengan persistKey popup. */
  key: string
  slot: PinSlot
  pos?: { x: number; y: number } | null
  width?: number | null
  height?: number | null
}

export interface PinnedBounds {
  pos?: { x: number; y: number } | null
  width?: number | null
  height?: number | null
}

export function readPinnedPopups(): PinnedRecord[] {
  const raw = readRaw('pinnedPopups')
  if (raw) return parse(raw)

  // Migrasi dari record tunggal versi sebelumnya. Popup lama default-nya
  // menempel di kanan-bawah, jadi masuk ke slot 'bottom'.
  const legacy = readRaw('pinnedPopup')
  if (!legacy) return []
  try {
    const saved = JSON.parse(legacy) as PinnedBounds & { key?: string }
    removeRaw('pinnedPopup')
    if (!saved.key) return []
    const migrated: PinnedRecord[] = [
      { key: saved.key, slot: 'bottom', pos: saved.pos, width: saved.width, height: saved.height },
    ]
    writePinnedPopups(migrated)
    return migrated
  } catch {
    removeRaw('pinnedPopup')
    return []
  }
}

export function writePinnedPopups(list: PinnedRecord[]): void {
  if (list.length === 0) removeRaw('pinnedPopups')
  else writeRaw('pinnedPopups', JSON.stringify(list))
}

/**
 * Catat/perbarui satu popup. Popup baru mengambil slot yang masih kosong;
 * kalau dua-duanya terpakai, popup terlama dikeluarkan dan slotnya dipakai.
 */
export function upsertPinnedPopup(key: string, bounds: PinnedBounds): PinnedRecord[] {
  const list = readPinnedPopups()
  const found = list.find((r) => r.key === key)
  if (found) {
    const next = list.map((r) => (r.key === key ? { ...r, ...bounds } : r))
    writePinnedPopups(next)
    return next
  }

  const taken = new Set(list.map((r) => r.slot))
  const free = SLOT_ORDER.find((s) => !taken.has(s))
  const kept = free ? list : list.slice(1)
  const slot = free ?? list[0].slot
  const next = [...kept, { key, slot, ...bounds }].slice(-MAX_PINNED_POPUPS)
  writePinnedPopups(next)
  return next
}

export function removePinnedPopup(key: string): PinnedRecord[] {
  const next = readPinnedPopups().filter((r) => r.key !== key)
  writePinnedPopups(next)
  return next
}

/** Buang record yang catatannya sudah hilang / tidak lagi pinned. */
export function keepPinnedPopups(keys: string[]): PinnedRecord[] {
  const list = readPinnedPopups()
  const next = list.filter((r) => keys.includes(r.key))
  if (next.length !== list.length) writePinnedPopups(next)
  return next
}

/** Urut tampilan: slot atas dulu, baru bawah. */
export function bySlot(a: PinnedRecord, b: PinnedRecord): number {
  const rank = (s: PinSlot) => (s === 'top' ? 0 : 1)
  return rank(a.slot) - rank(b.slot)
}

function parse(raw: string): PinnedRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r): r is PinnedRecord =>
        typeof r === 'object' && r !== null &&
        typeof (r as PinnedRecord).key === 'string' &&
        ((r as PinnedRecord).slot === 'top' || (r as PinnedRecord).slot === 'bottom'),
      )
      .slice(0, MAX_PINNED_POPUPS)
  } catch {
    return []
  }
}
