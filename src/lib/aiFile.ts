import * as XLSX from 'xlsx'
import { downloadBlob } from './utils'

/* ============================================================
   FILE DARI ASISTEN AI

   AI teks tidak bisa mengirim file biner, tapi aplikasi bisa
   MEMBUATKANNYA di browser: model hanya menuliskan data terstruktur
   dalam blok :::file … ::: di akhir jawaban, lalu blok itu diubah
   jadi .xlsx / .csv / .txt asli lewat SheetJS. Tidak butuh server.
   ============================================================ */

export interface AiFileSheet {
  name: string
  rows: unknown[][]
}

export interface AiFile {
  filename: string
  kind: 'xlsx' | 'text'
  sheets?: AiFileSheet[]
  text?: string
}

const BLOCK_RE = /:::file\s*\n?([\s\S]*?):::/g

/** Rapikan nama file: buang path, karakter liar, dan pastikan berekstensi. */
function sanitizeFilename(raw: string, fallbackExt: string): string {
  const base =
    (raw || 'file')
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001F<>:"|?*]/g, '')
      .trim() || 'file'
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${fallbackExt}`
}

/** Nama sheet valid Excel: maks 31 karakter, tanpa : \ / ? * [ ]. */
function sanitizeSheetName(name: string, index: number): string {
  const clean = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return clean || `Sheet${index + 1}`
}

function parseBlock(body: string): AiFile | null {
  // Model kadang membungkus JSON dengan fence markdown — buang dulu.
  const cleaned = body
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  // Ambil objek JSON pertama yang lengkap di dalam blok.
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(cleaned.slice(start, end + 1)) as typeof data
  } catch {
    return null
  }

  const rawName = typeof data.filename === 'string' ? data.filename : 'file'

  // File teks mentah (.txt/.csv/.md/.json) — isinya satu string.
  if (data.type === 'text' || (typeof data.text === 'string' && !Array.isArray(data.sheets))) {
    return { filename: sanitizeFilename(rawName, 'txt'), kind: 'text', text: String(data.text ?? '') }
  }

  // Spreadsheet — sheets = daftar { name, rows: array 2D }.
  if (!Array.isArray(data.sheets)) return null
  const sheets: AiFileSheet[] = []
  for (const entry of (data.sheets as unknown[]).slice(0, 20)) {
    const o = (entry ?? {}) as Record<string, unknown>
    const rows = Array.isArray(o.rows)
      ? (o.rows as unknown[]).map((r) => (Array.isArray(r) ? r : [r]))
      : []
    sheets.push({ name: String(o.name ?? '').slice(0, 31) || 'Sheet', rows })
  }
  if (sheets.length === 0) return null
  return { filename: sanitizeFilename(rawName, 'xlsx'), kind: 'xlsx', sheets }
}

/**
 * Pisahkan jawaban AI jadi teks tampilan + daftar file.
 *
 * Blok yang gagal di-parse DIBIARKAN tampil apa adanya (teks JSON-nya tetap
 * terbaca user) supaya jawaban tidak pernah "hilang" hanya karena formatnya
 * sedikit meleset.
 */
export function extractFileBlocks(raw: string): { text: string; files: AiFile[] } {
  const files: AiFile[] = []
  const text = raw.replace(BLOCK_RE, (match, body: string) => {
    const file = parseBlock(body)
    if (!file) return match
    files.push(file)
    return ''
  })
  return { text: text.trim(), files }
}

/**
 * Sembunyikan blok yang BELUM selesai ditulis saat streaming, supaya user
 * tidak melihat JSON mengalir kata demi kata di bubble chat.
 */
export function stripIncompleteBlock(text: string): { text: string; pending: boolean } {
  const i = text.lastIndexOf(':::file')
  if (i < 0) return { text, pending: false }
  const closed = text.indexOf(':::', i + 7)
  if (closed >= 0) return { text, pending: false }
  return { text: text.slice(0, i).trimEnd(), pending: true }
}

/* ---------- Pembuatan file ---------- */

/** Nilai cell apa pun jadi nilai aman untuk aoa_to_sheet. */
function safeCell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return ''
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v as never
  return JSON.stringify(v)
}

/** Lebar kolom kasar dari panjang isi, supaya file terbuka rapi. */
function colWidths(rows: unknown[][]): { wch: number }[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, c) => {
      const len = String(cell ?? '').length + 2
      widths[c] = Math.max(widths[c] ?? 10, Math.min(len, 48))
    })
  }
  return widths.map((wch) => ({ wch: Math.max(wch, 8) }))
}

function buildWorkbook(file: AiFile): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  ;(file.sheets ?? []).forEach((sheet, i) => {
    let name = sanitizeSheetName(sheet.name, i)
    // Excel menuntut nama sheet unik dalam satu workbook.
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const suffix = ` (${n})`
      name = sanitizeSheetName(sheet.name, i).slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())

    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => row.map(safeCell)))
    // String berawalan "=" jadi rumus Excel sungguhan — Excel menghitung
    // ulang nilainya saat file dibuka, jadi user bisa mengubah input.
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith('!')) continue
      const cell = ws[addr] as XLSX.CellObject
      if (cell.t === 's' && typeof cell.v === 'string' && cell.v.startsWith('=')) {
        ws[addr] = { t: 'n', f: cell.v.slice(1) }
      }
    }
    ws['!cols'] = colWidths(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  return wb
}

/** Bentukkan file di memori lalu unduh — semuanya client-side. */
export function downloadAiFile(file: AiFile): void {
  if (file.kind === 'xlsx') {
    const out = XLSX.write(buildWorkbook(file), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    downloadBlob(
      new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      file.filename,
    )
    return
  }
  const ext = file.filename.toLowerCase()
  const type = ext.endsWith('.csv')
    ? 'text/csv'
    : ext.endsWith('.json')
      ? 'application/json'
      : ext.endsWith('.md')
        ? 'text/markdown'
        : 'text/plain'
  downloadBlob(new Blob([file.text ?? ''], { type: `${type};charset=utf-8` }), file.filename)
}

/** Perkiraan ukuran untuk label tombol (tidak perlu presisi). */
export function estimateAiFileSize(file: AiFile): number {
  if (file.kind === 'text') return new Blob([file.text ?? '']).size
  return (file.sheets ?? []).reduce(
    (n, s) =>
      n +
      s.rows.reduce(
        (m, row) => m + row.reduce((k: number, c) => k + String(c ?? '').length, 0),
        0,
      ),
    0,
  )
}
