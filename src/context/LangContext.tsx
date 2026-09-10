import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dictionaries, interpolate, type Dict, type Lang } from '@/i18n'
import { readRaw, writeRaw } from '@/lib/storage'

/** Path bertitik ke dalam dictionary, mis. 'areas.summaryClient'. */
type Vars = Record<string, string | number>

interface LangValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
  /** Ambil string terjemahan lewat path bertitik. */
  t: (path: string, vars?: Vars) => string
  d: Dict
}

const LangContext = createContext<LangValue | null>(null)

function resolvePath(dict: Dict, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), dict)
  return typeof value === 'string' ? value : undefined
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readRaw('lang') === 'en' ? 'en' : 'id'))

  useEffect(() => {
    writeRaw('lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const toggle = useCallback(() => setLangState((p) => (p === 'id' ? 'en' : 'id')), [])

  const value = useMemo<LangValue>(() => {
    const dict = dictionaries[lang]
    return {
      lang,
      setLang,
      toggle,
      d: dict,
      t: (path, vars) => {
        // Fallback ke Indonesia lalu ke path mentah, supaya UI tidak pernah kosong.
        const raw = resolvePath(dict, path) ?? resolvePath(dictionaries.id, path) ?? path
        return interpolate(raw, vars)
      },
    }
  }, [lang, setLang, toggle])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang harus dipakai di dalam LangProvider')
  return ctx
}
