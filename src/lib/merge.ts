import type { AppData, Building, Project } from '@/types'

/* ============================================================
   MERGE DUA-ARAH (perangkat <-> Google Drive)
   Model "last-writer-wins per item": dua perangkat sama-sama
   boleh mengubah data, dan saat sync isi keduanya digabung.

   Aturan:
   - Koleksi digabung per-id. Item yang hanya ada di satu sisi
     dianggap baru -> ikut. Item yang ada di dua sisi ->
     versi dengan updatedAt terbaru yang menang.
   - Task yang konflik: pemenang updatedAt untuk teks/status,
     tapi gambar, link, dan chat dari KEDUA sisi digabung.
   - warnings digabung lalu dibuang duplikat dedupeKey-nya
     (sifatnya notifikasi, duplikat tidak berguna).
   - updatedAt hasil merge = stempel waktu terbaru dari keduanya,
     jadi perangkat lain yang lebih ketinggalan tetap akan menarik.
   ============================================================ */

/** Item ber-id — batas minimum apa pun yang bisa digabung. */
interface Identified {
  id: string
}

/** Ambil stempel pembanding item: updatedAt, jatuh ke createdAt. */
function stampOf(x: { updatedAt?: string; createdAt?: string }): string {
  return x.updatedAt || x.createdAt || ''
}

function newer<T>(a: T, b: T): T {
  return stampOf(a as never) >= stampOf(b as never) ? a : b
}

function findById<T>(list: T[], id: string): T | undefined {
  return list.find((x) => (x as Identified).id === id)
}

/**
 * Gabung dua list ber-id. Yang hanya ada di satu sisi ikut;
 * yang ada di keduanya menang dari sisi terbaru (updatedAt,
 * jatuh ke createdAt untuk item tanpa updatedAt).
 */
function unionById<T>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map((x) => [(x as Identified).id, x]))
  for (const r of remote) {
    const key = (r as Identified).id
    const l = byId.get(key)
    byId.set(key, l ? newer(l, r) : r)
  }
  return [...byId.values()]
}

/** Gabung dua building beserta seluruh task di dalamnya. */
function mergeBuilding(local: Building, remote: Building): Building {
  const win = newer(local, remote)
  return {
    ...win,
    tasks: unionById(local.tasks, remote.tasks).map((t) => {
      const l = findById(local.tasks, t.id)
      const r = findById(remote.tasks, t.id)
      if (!l || !r) return t
      // Task konflik: pemenang keseluruhan, tapi gambar/link/chat dari
      // kedua sisi digabung supaya lampiran yang ditambah di perangkat
      // berbeda tidak saling menghapus.
      const winTask = newer(l, r)
      return {
        ...winTask,
        images: unionById(l.images, r.images),
        links: unionById(l.links, r.links),
        chat: unionById(l.chat, r.chat),
      }
    }),
  }
}

/** Gabung dua project beserta building-nya. */
function mergeProject(local: Project, remote: Project): Project {
  const win = newer(local, remote)
  return {
    ...win,
    buildings: unionById(local.buildings, remote.buildings).map((b) => {
      const l = findById(local.buildings, b.id)
      const r = findById(remote.buildings, b.id)
      return l && r ? mergeBuilding(l, r) : b
    }),
  }
}

/**
 * Gabungkan data lokal dan data Drive menjadi satu AppData.
 * Keduanya tidak dimutasi — hasilnya objek baru.
 */
export function mergeData(local: AppData, remote: AppData): AppData {
  const projects = unionById(local.projects, remote.projects).map((p) => {
    const l = findById(local.projects, p.id)
    const r = findById(remote.projects, p.id)
    return l && r ? mergeProject(l, r) : p
  })

  return {
    version: Math.max(local.version, remote.version),
    projects,
    standards: unionById(local.standards, remote.standards),
    notes: unionById(local.notes, remote.notes),
    // Notifikasi: gabungkan lalu buang duplikat kunci dedup-nya.
    warnings: unionById(local.warnings, remote.warnings)
      .filter((w, i, all) => all.findIndex((x) => x.dedupeKey === w.dedupeKey) === i)
      .slice(0, 200),
    boards: unionById(local.boards, remote.boards),
    members: unionById(local.members, remote.members),
    updatedAt: [local.updatedAt, remote.updatedAt].sort().at(-1) ?? local.updatedAt,
  }
}
