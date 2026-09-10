/**
 * Rich text ringan untuk deskripsi task.
 *
 * Editor memakai contentEditable + document.execCommand (satu-satunya cara
 * bawaan browser membuat bold/italic/underline/strike pada seleksi tanpa
 * dependensi besar seperti ProseMirror). Hasilnya HTML kecil yang selalu
 * lolos sanitizeStrict di bawah ini sebelum disimpan maupun dirender, jadi
 * yang tersimpan di localStorage/Drive hanya teks + tag format yang aman.
 */

/** Tag & atribut yang diizinkan lewat — sisanya dibuang. */
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'BR', 'DIV', 'P',
  'H1', 'H2', 'FONT', 'MARK', 'UL', 'OL', 'LI', 'IMG',
])
const ALLOWED_ATTRS = new Set(['style', 'class', 'color', 'size', 'face', 'src', 'alt'])

/** Warna yang ditawarkan palette — cocok untuk tema terang & gelap. */
export const TEXT_COLORS = [
  '#0f172a', '#475569', '#94a3b8',
  '#0a84ff', '#5c78f0', '#7c3aed',
  '#28a868', '#0d9488', '#e09614',
  '#e23e3e', '#db2777', '#78350f',
] as const

/** Warna stabilo (marker) untuk blok teks terseleksi. */
export const HIGHLIGHT_COLORS = [
  '#fff173', '#fcdf6d', '#fdb8b8', '#ffc9de',
  '#b5f0ca', '#a7e8eb', '#bcd7ff', '#e2c8ff',
] as const

/** Ukuran font yang ditawarkan dropdown — px eksplisit biar konsisten antar browser. */
export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28] as const

/** Escaping untuk jalur plain-text (kartu task, konteks AI, dsb). */
export function htmlToText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/ /g, ' ')
}

/**
 * Bersihkan HTML hasil editor: hanya tag format & atribut style/class yang
 * tersisa, event handler (onclick dst) dan tag berbahaya dibuang total.
 * Dipakai saat menyimpan DAN saat merender — defense in depth.
 */
export function sanitizeStrict(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html

  const walk = (node: Node): Node[] => {
    const out: Node[] = []
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push(child)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName
      if (!ALLOWED_TAGS.has(tag)) {
        // Tag terlarang: buka bungkusnya, simpan isi anaknya saja.
        out.push(...walk(el))
        continue
      }
      const clone = document.createElement(tag)
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (!ALLOWED_ATTRS.has(name)) continue
        // src gambar: hanya data: URI kecil hasil paste/unggah sendiri.
        if (name === 'src') {
          if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(attr.value) && attr.value.length <= 800_000) {
            clone.setAttribute('src', attr.value)
          }
          continue
        }
        // style dibatasi ke properti format teks supaya tidak bisa dipakai
        // menyelundupkan url() atau expression().
        const safe = attr.value.replace(/[^a-z0-9#.,()%\s:;-]/gi, '')
        clone.setAttribute(attr.name, safe)
      }
      for (const kept of walk(el)) clone.appendChild(kept)
      out.push(clone)
    }
    return out
  }

  const clean = document.createElement('div')
  for (const node of walk(root)) clean.appendChild(node)
  return clean.innerHTML
}

/**
 * HTML yang dirender di kartu task: satu baris = satu <p> bergaris bawah,
 * meniru buku bergaris. Baris kosong tetap digambar (tinggi minimum).
 */
export function renderLinedHtml(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = sanitizeStrict(html)

  // Satukan tiap blok/BR menjadi baris; tiap baris dibungkus <p class="lined-line">.
  const lines: string[] = []
  let current = ''
  const flush = () => {
    lines.push(current)
    current = ''
  }
  const walk = (node: Node, markup: string) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        current += escapeHtml(child.textContent ?? '').replace(/ /g, '&nbsp;')
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        if (el.tagName === 'BR') {
          flush()
          continue
        }
        if (el.tagName === 'UL' || el.tagName === 'OL') {
          // List dirender jadi baris-baris berbullet/bernomor.
          Array.from(el.children).forEach((li, idx) => {
            if (li.tagName !== 'LI') return
            flush()
            current = el.tagName === 'UL' ? '•&nbsp;&nbsp;' : `${idx + 1}.&nbsp;&nbsp;`
            walk(li, markup)
            flush()
          })
          continue
        }
        if (el.tagName === 'IMG') {
          current += `<img src="${escapeHtml(el.getAttribute('src') ?? '')}" alt="" style="max-width:100%;border-radius:8px">`
          continue
        }
        const open = wrapMarkup(el, markup)
        walk(el, open.inner)
        if (open.close) current += open.close
      }
    }
  }
  walk(root, '')

  // Markup pembuka di awal baris baru: format lintas baris (mis. bold
  // mencakup dua paragraf) tetap menerus.
  let carry = ''
  const result = lines.map((raw) => {
    let line = carry + raw
    carry = ''
    // Tutup tag yang masih terbuka di akhir baris, catat untuk baris berikutnya.
    const opens = line.match(/<(b|strong|i|em|u|s)\b[^>]*>/g) ?? []
    const closes = line.match(/<\/(b|strong|i|em|u|s)>/g) ?? []
    if (opens.length > closes.length) {
      for (let i = closes.length; i < opens.length; i++) {
        const name = /<(b|strong|i|em|u|s)\b/.exec(opens[i])?.[1] ?? 'b'
        line += `</${name}>`
        carry += opens[i]
      }
    }
    return `<p class="lined-line">${line || '<br>'}</p>`
  })
  return result.join('')
}

/** Bangun tag pembuka/penutup sesuai format elemen (b/i/u/s + style). */
function wrapMarkup(el: HTMLElement, inner: string): { inner: string; close: string } {
  const tag = el.tagName
  let open = ''
  let close = ''
  const style = el.getAttribute('style') ?? ''

  if (tag === 'B' || tag === 'STRONG') { open += '<b>'; close = `</b>${close}` }
  if (tag === 'I' || tag === 'EM') { open += '<i>'; close = `</i>${close}` }
  if (tag === 'U') { open += '<u>'; close = `</u>${close}` }
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') { open += '<s>'; close = `</s>${close}` }
  if (tag === 'MARK') { open += '<mark>'; close = `</mark>${close}` }

  if (tag === 'FONT') {
    // <font> hasil execCommand direwrite jadi span CSS agar render tetap same.
    const color = el.getAttribute('color') ?? ''
    const fsize = el.getAttribute('size') ?? ''
    const face = el.getAttribute('face') ?? ''
    const css = [
      color ? `color:${color}` : '',
      fsize ? `font-size:${fontPointSizeToPx(fsize)}px` : '',
      face ? `font-family:${face}` : '',
    ].filter(Boolean).join(';')
    if (css) { open += `<span style="${escapeHtml(css)}">`; close = `</span>${close}` }
  }

  if (tag === 'H1' || tag === 'H2') {
    open += `<${tag.toLowerCase()} class="lined-h">`
    close = `</${tag.toLowerCase()}>${close}`
  }

  if (style) {
    // Tulis ulang style dari atribut yang sudah lolos sanitizeStrict.
    open += `<span style="${escapeHtml(style)}">`
    close = `</span>${close}`
  }

  return { inner: `${open}${inner}`, close }
}

/** Konversi ukuran font[1..7] HTML lama ke px (3 = normal ~14px). */
function fontPointSizeToPx(size: string): number {
  const n = Number(size)
  const table = [10, 11, 13, 14, 18, 23, 30]
  return table[Number.isFinite(n) ? Math.min(6, Math.max(0, Math.round(n) - 1)) : 2] ?? 14
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
