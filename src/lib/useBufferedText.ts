import { useEffect, useRef, useState } from 'react'

/**
 * Buffer teks di state lokal, lalu commit ke store global setelah user
 * berhenti mengetik (atau saat blur).
 *
 * Tanpa ini, tiap ketikan memicu update store -> seluruh pohon komponen
 * render ulang -> mengetik terasa berat, terutama di task yang punya gambar.
 */
export function useBufferedText(
  value: string,
  commit: (next: string) => void,
  delay = 400,
): {
  value: string
  onChange: (e: { target: { value: string } }) => void
  onBlur: () => void
} {
  const [draft, setDraft] = useState(value)
  const commitRef = useRef(commit)
  commitRef.current = commit
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Ikut nilai dari luar hanya kalau user tidak sedang mengetik,
  // supaya ketikan tidak tertimpa oleh state lama.
  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  // Pastikan ketikan terakhir tetap tersimpan saat komponen dilepas.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) commitRef.current(draftRef.current)
    },
    [],
  )

  const draftRef = useRef(draft)
  draftRef.current = draft

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    commitRef.current(draftRef.current)
  }

  return {
    value: draft,
    onChange: (e) => {
      const next = e.target.value
      dirty.current = true
      setDraft(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        dirty.current = false
        commitRef.current(next)
      }, delay)
    },
    onBlur: flush,
  }
}
