/* ============================================================
   MODEL DATA
   Diturunkan langsung dari flowchart:

   STORAGE GOOGLE DRIVE  <-->  CATATAN STANDARD
        CATATAN STANDARD --> BISA IMPORT DARI EXCEL
        CATATAN STANDARD --> ELECTRICAL / ELECTRONIC / OTHER --> PERKATEGORI

   NAMA PROJECT --> NAMA BUILDING (nama bebas diketik user)

   Catatan: "FINISH GOOD WAREHOUSE", "RAW MATERIAL WAREHOUSE", dan
   "UTILITY" pada flowchart adalah CONTOH nama building, bukan struktur
   tetap -- jadi tidak dibuat otomatis sebagai sub-level.

   tiap building --> SUMMARY CLIENT --> (AI cek ke STANDARD IEC/NEC/PUIL/SNI)
                                    --> WARNING DI HANDPHONE / PC
                 --> TARGET SUBMIT  --> SUDAH / BELUM
                 --> TASK (TUGAS)   --> SUDAH / BELUM
                       TASK: gambar, coretan di gambar (papan tulis),
                             link, tanya AI
   ============================================================ */

export type ISODate = string

/** ELECTRICAL / ELECTRONIC / OTHER pada flowchart. */
export type StandardCategory = 'electrical' | 'electronic' | 'other'

/** Badan standard yang dipakai AI sebagai acuan review. */
export type StandardBody = 'IEC' | 'NEC' | 'PUIL' | 'SNI'

export const STANDARD_CATEGORIES: StandardCategory[] = ['electrical', 'electronic', 'other']
export const STANDARD_BODIES: StandardBody[] = ['IEC', 'NEC', 'PUIL', 'SNI']

/** CATATAN STANDARD — satu catatan/klausul standard. */
export interface StandardNote {
  id: string
  category: StandardCategory
  /** PERKATEGORI — sub-kategori bebas, mis. "Kabel & Tray", "Proteksi Petir". */
  subcategory: string
  /** Kode klausul, mis. "PUIL 2011 3.24.2" atau "IEC 60364-4-41". */
  code: string
  body: StandardBody
  title: string
  content: string
  tags: string[]
  createdAt: ISODate
  updatedAt: ISODate
}

/** SUDAH / BELUM. */
export type DoneStatus = 'sudah' | 'belum'

/** Coretan di atas gambar — satu goresan papan tulis. */
export interface Stroke {
  id: string
  /** Titik ternormalisasi 0..1 terhadap ukuran gambar, jadi tahan resize. */
  points: { x: number; y: number }[]
  color: string
  width: number
  /** 'pen' menggambar, 'eraser' menghapus goresan yang tersentuh. */
  tool: 'pen' | 'highlighter'
}

/** Label teks yang ditempel di atas gambar. */
export interface Annotation {
  id: string
  x: number
  y: number
  text: string
  color: string
}

/** Gambar pada task, lengkap dengan coretan papan tulisnya. */
export interface TaskImage {
  id: string
  name: string
  /** data URL (base64). Disimpan lokal, ikut ter-backup ke Google Drive. */
  dataUrl: string
  strokes: Stroke[]
  annotations: Annotation[]
  createdAt: ISODate
}

export interface TaskLink {
  id: string
  label: string
  url: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: ISODate
}

/** TASK (TUGAS). */
export interface Task {
  id: string
  title: string
  description: string
  status: DoneStatus
  dueDate: ISODate | null
  images: TaskImage[]
  links: TaskLink[]
  /** Riwayat "tanya sama AI" khusus task ini. */
  chat: ChatMessage[]
  /** Papan canvas (Excalidraw) yang menempel langsung pada task ini. */
  canvas?: CanvasScene | null
  createdAt: ISODate
  updatedAt: ISODate
}

/** Scene canvas Excalidraw: elemen + file biner (gambar yang di-paste). */
export interface CanvasScene {
  elements: unknown[]
  files?: Record<string, { id: string; dataURL: string; mimeType: string; created: number }>
}

/**
 * CANVAS BOARD — papan gambar mandiri untuk diskusi team (beda dari task).
 * Bisa dibagikan lewat link: /boards/:boardId
 */
export interface CanvasBoard {
  id: string
  title: string
  scene: CanvasScene | null
  /** Kunci acak di link; yang punya link (dengan kunci) yang bisa membuka. */
  shareKey: string
  createdAt: ISODate
  updatedAt: ISODate
}

/** Temuan AI saat SUMMARY CLIENT direview terhadap standard. */
export type FindingSeverity = 'critical' | 'warning' | 'info'

export interface Finding {
  id: string
  severity: FindingSeverity
  /** Klausul yang dilanggar / dirujuk, mis. "PUIL 2011 4.3.2". */
  reference: string
  issue: string
  recommendation: string
}

export interface AiReview {
  id: string
  createdAt: ISODate
  model: string
  /** Isi summary client persis saat direview, untuk jejak audit. */
  reviewedText: string
  findings: Finding[]
  /** Ringkasan naratif dari AI. */
  verdict: string
}

/**
 * NAMA BUILDING — unit terkecil yang dilacak.
 *
 * Namanya bebas, mis. "Raw Material Warehouse", "Utility", "Building A".
 */
export interface Building {
  id: string
  name: string
  notes: string
  /** SUMMARY CLIENT untuk building ini. */
  summaryClient: string
  /** Hasil review AI terakhir; null kalau belum pernah direview. */
  lastReview: AiReview | null
  /** TARGET SUBMIT. */
  targetSubmitDate: ISODate | null
  targetSubmitStatus: DoneStatus
  tasks: Task[]
  createdAt: ISODate
  updatedAt: ISODate
}

/** NAMA PROJECT. */
export interface Project {
  id: string
  name: string
  client: string
  location: string
  buildings: Building[]
  createdAt: ISODate
  updatedAt: ISODate
}

/** WARNING DI HANDPHONE OR PC. */
export interface Warning {
  id: string
  severity: FindingSeverity
  title: string
  body: string
  /** Rute in-app yang dituju kalau warning diklik. */
  href: string
  read: boolean
  createdAt: ISODate
  /** Kunci dedup supaya warning yang sama tidak menumpuk. */
  dedupeKey: string
}

/** Seluruh isi database aplikasi — inilah yang di-backup ke Google Drive. */
export interface AppData {
  version: number
  projects: Project[]
  standards: StandardNote[]
  warnings: Warning[]
  boards: CanvasBoard[]
  updatedAt: ISODate
}

export const DATA_VERSION = 2

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    projects: [],
    standards: [],
    warnings: [],
    boards: [],
    updatedAt: new Date().toISOString(),
  }
}
