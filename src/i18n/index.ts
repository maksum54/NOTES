import { id, type Dict } from './id'
import { en } from './en'

export type Lang = 'id' | 'en'
export type { Dict }

export const dictionaries: Record<Lang, Dict> = { id, en }

export const LANG_LABEL: Record<Lang, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
}

/** Ganti placeholder {name} di string terjemahan. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  )
}
