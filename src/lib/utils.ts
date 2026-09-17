/** ID pendek yang cukup unik untuk data lokal. */
export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${rand}` : rand
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Selisih hari kalender dari hari ini (negatif = sudah lewat). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const t = new Date()
  const b = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Kecilkan & kompres gambar sebelum disimpan, supaya localStorage tidak jebol. */
export function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode-failed'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas-unavailable'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/* ============================================================
   WARNA KARTU vs WARNA TEKS
   Kartu/pop-up yang diberi warna dari palet memakai warna itu
   sebagai latar, sementara warna teks ikut tema aplikasi. Di tema
   gelap hasilnya teks hampir putih di atas kuning/pink — praktis
   tidak terbaca. Jadi warna tinta ditentukan oleh LATAR KARTU-nya,
   bukan oleh tema, lewat override variabel --ink di elemen itu.
   ============================================================ */

/** Triplet RGB variabel --ink untuk tema terang & gelap (lihat index.css). */
const INK_ON_LIGHT = { ink: '18 24 40', soft: '78 88 112', faint: '132 142 166' }
const INK_ON_DARK = { ink: '238 243 255', soft: '174 186 214', faint: '126 140 172' }

/** Luminansi relatif ala WCAG; null kalau warnanya tidak terbaca. */
export function colorLuminance(color: string): number | null {
  const s = (color ?? '').trim().toLowerCase()
  let rgb: [number, number, number] | null = null

  if (s.startsWith('#')) {
    const hex = s.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6)
    if (full.length !== 6 || /[^0-9a-f]/.test(full)) return null
    rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  } else {
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
    if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  if (!rgb) return null

  const lin = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** Latar kartu ini tergolong terang? (palet Keep semuanya pastel/terang) */
export function isLightSurface(color: string): boolean {
  const l = colorLuminance(color)
  return l === null ? true : l > 0.3
}

/**
 * Style inline yang mengunci warna tinta pada satu kartu/pop-up berwarna:
 * latar terang -> tinta gelap, latar gelap -> tinta terang, terlepas dari
 * tema aplikasi. Semua turunannya ikut karena memakai `rgb(var(--ink))`.
 */
export function inkStyleFor(color: string | null | undefined): Record<string, string> | undefined {
  if (!color) return undefined
  const ink = isLightSurface(color) ? INK_ON_LIGHT : INK_ON_DARK
  return {
    '--ink': ink.ink,
    '--ink-soft': ink.soft,
    '--ink-faint': ink.faint,
  }
}
