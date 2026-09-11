import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readRaw, writeRaw } from '@/lib/storage'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeValue {
  theme: ThemeChoice
  resolved: ResolvedTheme
  setTheme: (t: ThemeChoice) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  document
    .querySelector('meta[name="theme-color"]:not([media])')
    ?.setAttribute('content', resolved === 'dark' ? '#08080a' : '#fafafc')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const stored = readRaw('theme')
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark'
  })
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readRaw('theme') === 'system' || !readRaw('theme')
      ? systemTheme()
      : (readRaw('theme') as ResolvedTheme),
  )

  useEffect(() => {
    const next = theme === 'system' ? systemTheme() : theme
    setResolved(next)
    apply(next)
    writeRaw('theme', theme)
  }, [theme])

  // Ikut berubah kalau OS ganti tema, tapi hanya saat pilihan = system.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next = systemTheme()
      setResolved(next)
      apply(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: ThemeChoice) => setThemeState(t), [])
  const toggle = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark')),
    [],
  )

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme harus dipakai di dalam ThemeProvider')
  return ctx
}
