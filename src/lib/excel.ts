import * as XLSX from 'xlsx'
import type { StandardCategory, StandardBody, StandardNote } from '@/types'
import { STANDARD_BODIES, STANDARD_CATEGORIES } from '@/types'
import { nowISO, uid, downloadBlob } from './utils'

/* ============================================================
   BISA IMPORT DARI EXCEL  (dan ekspor balik)
   ============================================================ */

/** Cocokkan nama kolom apa adanya: spasi/kapital/underscore diabaikan. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s._-]+/g, '')
}

const FIELD_ALIASES: Record<string, string[]> = {
  category: ['category', 'kategori', 'jenis', 'tipe', 'type'],
  subcategory: ['subcategory', 'perkategori', 'subkategori', 'subkat', 'group', 'grup'],
  body: ['body', 'standard', 'standar', 'badan', 'source', 'sumber'],
  code: ['code', 'kode', 'clause', 'klausul', 'pasal', 'ref', 'referensi'],
  title: ['title', 'judul', 'nama', 'name', 'subject'],
  content: ['content', 'isi', 'konten', 'deskripsi', 'description', 'keterangan', 'catatan', 'note'],
  tags: ['tags', 'tag', 'label', 'keyword', 'keywords'],
}

function pick(row: Record<string, unknown>, field: keyof typeof FIELD_ALIASES): string {
  const aliases = FIELD_ALIASES[field]
  for (const [rawKey, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === '') continue
    if (aliases.includes(normalizeKey(rawKey))) return String(value).trim()
  }
  return ''
}

function coerceCategory(value: string): StandardCategory {
  const v = value.toLowerCase()
  if (v.startsWith('electri') || v.startsWith('listrik') || v.startsWith('elektri')) return 'electrical'
  if (v.startsWith('electro') || v.startsWith('elektro')) return 'electronic'
  const match = STANDARD_CATEGORIES.find((c) => c === v)
  return match ?? 'other'
}

function coerceBody(value: string): StandardBody {
  const v = value.toUpperCase()
  const match = STANDARD_BODIES.find((b) => v.includes(b))
  return match ?? 'IEC'
}

/** Baca .xlsx/.xls/.csv jadi StandardNote[]. Sheet pertama, baris 1 = header. */
export async function parseStandardsWorkbook(file: File): Promise<StandardNote[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: '',
    raw: false,
  })

  const notes: StandardNote[] = []
  for (const row of rows) {
    const title = pick(row, 'title')
    const content = pick(row, 'content')
    const code = pick(row, 'code')
    // Baris tanpa judul, isi, maupun kode dianggap baris kosong/pemisah.
    if (!title && !content && !code) continue

    const tagsRaw = pick(row, 'tags')
    const stamp = nowISO()
    notes.push({
      id: uid('std'),
      category: coerceCategory(pick(row, 'category')),
      subcategory: pick(row, 'subcategory'),
      body: coerceBody(pick(row, 'body') || code),
      code,
      title: title || code || content.slice(0, 60),
      content,
      tags: tagsRaw
        ? tagsRaw
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      createdAt: stamp,
      updatedAt: stamp,
    })
  }
  return notes
}

export function exportStandardsWorkbook(notes: StandardNote[], filename = 'catatan-standard.xlsx'): void {
  const rows = notes.map((n) => ({
    category: n.category,
    subcategory: n.subcategory,
    body: n.body,
    code: n.code,
    title: n.title,
    content: n.content,
    tags: n.tags.join(', '),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 40 }, { wch: 70 }, { wch: 22 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Standard')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  )
}

/** Template kosong berisi contoh baris, supaya user tahu format kolomnya. */
export function downloadStandardsTemplate(): void {
  const sample: StandardNote[] = [
    {
      id: '',
      category: 'electrical',
      subcategory: 'Kabel & Tray',
      body: 'PUIL',
      code: 'PUIL 2011 7.11.2',
      title: 'Faktor pengisian cable tray',
      content: 'Pengisian cable tray tidak boleh melebihi 40% dari luas penampang tray.',
      tags: ['tray', 'fill ratio'],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: '',
      category: 'electronic',
      subcategory: 'Fire Alarm',
      body: 'SNI',
      code: 'SNI 03-3985-2000',
      title: 'Jarak antar detektor asap',
      content: 'Jarak maksimum antar detektor asap pada langit-langit datar adalah 12 m.',
      tags: ['fire alarm', 'detektor'],
      createdAt: '',
      updatedAt: '',
    },
  ]
  exportStandardsWorkbook(sample, 'template-catatan-standard.xlsx')
}
