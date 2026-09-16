/**
 * JENDELA CATATAN TERPISAH ("sticky notes").
 *
 * Popup yang di-pin tetap ikut mati kalau browser di-minimize, karena dia
 * cuma sebuah <div> di dalam halaman. Supaya catatan benar-benar berlaku
 * seperti Sticky Notes milik OS, isinya dipindah ke JENDELA lain:
 *
 *  1. Document Picture-in-Picture (Chrome/Edge 116+) — jendela kecil yang
 *     SELALU DI ATAS aplikasi lain, jadi catatan tetap terlihat walau
 *     browser di-minimize atau ketutup Excel/AutoCAD.
 *  2. Kalau API itu tidak ada (Firefox/Safari): window.open biasa. Bukan
 *     always-on-top, tapi tetap jendela OS sendiri — tidak ikut hilang saat
 *     jendela utama di-minimize.
 *
 * Isi jendela tetap dirender oleh React halaman utama lewat portal, jadi
 * semua editing, auto-save, dan sinkron Drive berjalan seperti biasa.
 */

import { readRaw, writeRaw } from '@/lib/storage'

interface PipRequestOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

interface PipApi {
  requestWindow(options?: PipRequestOptions): Promise<Window>
  window: Window | null
}

function pipApi(): PipApi | null {
  const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture
  return api && typeof api.requestWindow === 'function' ? api : null
}

/** Browser mendukung jendela yang selalu tampil di atas aplikasi lain? */
export function supportsAlwaysOnTop(): boolean {
  return pipApi() !== null
}

/** Ada cara apa pun untuk melepas catatan ke jendela sendiri? */
export function supportsDetachedWindow(): boolean {
  return supportsAlwaysOnTop() || typeof window.open === 'function'
}

export interface DetachedWindowHandle {
  win: Window
  /** Tempat React menaruh popup (portal target). */
  container: HTMLElement
  /** true = jendela Document PiP (selalu di atas aplikasi lain). */
  alwaysOnTop: boolean
  close: () => void
}

export interface DetachedWindowOptions {
  width?: number
  height?: number
  title?: string
  /** Dipanggil saat jendela ditutup — dari tombol jendelanya maupun dari sini. */
  onClose?: () => void
}

/**
 * Buka jendela catatan. HARUS dipanggil langsung dari handler klik: kedua
 * mekanisme (PiP maupun pop-up) mensyaratkan gestur pengguna.
 */
export async function openDetachedWindow({
  width = 420,
  height = 520,
  title = document.title,
  onClose,
}: DetachedWindowOptions = {}): Promise<DetachedWindowHandle | null> {
  const w = Math.max(240, Math.round(width))
  const h = Math.max(240, Math.round(height))

  let win: Window | null = null
  let alwaysOnTop = false

  const api = pipApi()
  if (api) {
    try {
      // Jendela PiP yang masih terbuka dari percobaan sebelumnya: tutup dulu.
      if (api.window && !api.window.closed) api.window.close()
      win = await api.requestWindow({ width: w, height: h })
      alwaysOnTop = true
    } catch {
      win = null
    }
  }

  if (!win) {
    const screenW = window.screen?.availWidth ?? 1280
    const left = Math.max(0, Math.round(screenW - w - 40))
    win = window.open('', 'notes-sticky', `popup=yes,width=${w},height=${h},left=${left},top=90`)
    if (win) win.resizeTo(w, h)
  }

  if (!win) return null

  const doc = win.document
  const target = win

  doc.title = title
  if (!doc.head.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    doc.head.appendChild(meta)
  }
  copyStyles(doc)
  const stopTheme = mirrorRootAttributes(doc)

  const base = doc.createElement('style')
  base.textContent = [
    'html,body{height:100%;margin:0;overflow:hidden;background:rgb(var(--page-1));}',
    '.notes-detached-root{position:relative;height:100%;}',
  ].join('\n')
  doc.head.appendChild(base)

  const container = doc.createElement('div')
  container.className = 'notes-detached-root'
  doc.body.appendChild(container)

  let finished = false
  const closeWin = () => {
    try {
      if (!target.closed) target.close()
    } catch {
      /* jendela sudah hilang duluan */
    }
  }
  const finish = () => {
    if (finished) return
    finished = true
    window.clearInterval(poll)
    stopTheme()
    target.removeEventListener('pagehide', finish)
    window.removeEventListener('pagehide', closeWin)
    onClose?.()
  }

  // pagehide = user menutup jendelanya. Polling jadi jaring pengaman kalau
  // event itu tidak sempat terkirim (mis. jendela ditutup oleh OS).
  const poll = window.setInterval(() => {
    if (target.closed) finish()
  }, 800)
  target.addEventListener('pagehide', finish)
  // Halaman utama ditutup/di-reload -> jangan tinggalkan jendela yatim.
  window.addEventListener('pagehide', closeWin)

  return {
    win: target,
    container,
    alwaysOnTop,
    close: () => {
      finish()
      closeWin()
    },
  }
}

/** Salin seluruh CSS halaman ke dokumen jendela baru (Tailwind + token tema). */
function copyStyles(doc: Document): void {
  type WithAdopted = { adoptedStyleSheets?: CSSStyleSheet[] }
  try {
    const adopted = (document as unknown as WithAdopted).adoptedStyleSheets
    if (adopted?.length) (doc as unknown as WithAdopted).adoptedStyleSheets = [...adopted]
  } catch {
    /* browser lama: abaikan */
  }

  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
      const style = doc.createElement('style')
      style.textContent = css
      if (sheet.media?.mediaText) style.media = sheet.media.mediaText
      doc.head.appendChild(style)
    } catch {
      // cssRules diblokir (stylesheet lintas domain) -> tautkan ulang saja.
      const node = sheet.ownerNode as HTMLLinkElement | null
      if (node && node.tagName === 'LINK' && node.href) {
        const link = doc.createElement('link')
        link.rel = 'stylesheet'
        link.href = node.href
        doc.head.appendChild(link)
      }
    }
  })
}

/** Ikutkan kelas tema (.dark/.light) & bahasa ke jendela catatan, termasuk
 *  saat user mengganti tema selagi jendela terbuka. */
function mirrorRootAttributes(doc: Document): () => void {
  const root = document.documentElement
  const apply = () => {
    doc.documentElement.className = root.className
    doc.documentElement.lang = root.lang
    doc.documentElement.dir = root.dir
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'lang', 'dir'] })
  return () => observer.disconnect()
}

/* ------------------------------------------------------------------ */
/* Preferensi: catatan yang di-pin langsung dilepas jadi jendela sticky */
/* ------------------------------------------------------------------ */

export function isAutoStickyOn(): boolean {
  return readRaw('stickyAuto') === '1'
}

export function setAutoSticky(on: boolean): void {
  writeRaw('stickyAuto', on ? '1' : '0')
}

/** Masih dalam rentang "baru saja diklik user"? Membuka jendela di luar
 *  gestur pasti ditolak browser, jadi auto-sticky dilewati saja. */
export function hasUserActivation(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  return ua ? ua.isActive : true
}
