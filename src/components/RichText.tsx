import { useMemo } from 'react'
import { htmlToText, renderLinedHtml, sanitizeStrict } from '@/lib/richtext'

/**
 * Render HTML deskripsi task dengan aman:
 * - berformat -> dibersihkan lalu digambar bergaris seperti buku
 * - plain text (data lama) -> digambar apa adanya
 *
 * Seluruh HTML sudah melewati sanitizeStrict (hanya tag format, tanpa
 * event handler), jadi aman untuk innerHTML.
 */
export function RichText({
  value,
  plainClassName,
  lined = true,
}: {
  value: string
  /** Class tambahan khusus jalur plain-text. */
  plainClassName?: string
  /** false = format dipertahankan tapi tanpa garis buku. */
  lined?: boolean
}) {
  const looksHtml = /<[a-z][\s\S]*>/i.test(value)

  const html = useMemo(() => {
    if (!looksHtml) return null
    return lined ? renderLinedHtml(value) : sanitizeStrict(value)
  }, [looksHtml, lined, value])

  if (html === null) {
    return <span className={plainClassName}>{value}</span>
  }
  return <span className={lined ? 'lined-html block' : 'block'} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Teks polos dari deskripsi (untuk tooltip, hitungan, dsb). */
export function richToText(value: string): string {
  return /<[a-z][\s\S]*>/i.test(value) ? htmlToText(value) : value
}
