import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import {
  Badge, EmptyState, Field, GlassButton, GlassCard, GlassInput, GlassSelect, GlassTextarea,
} from '@/components/glass/Glass'
import { ConfirmDialog, Modal } from '@/components/glass/Modal'
import { Segmented } from '@/components/glass/Segmented'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  BookIcon, DownloadIcon, EditIcon, ExcelIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon,
} from '@/components/icons'
import { downloadStandardsTemplate, exportStandardsWorkbook, parseStandardsWorkbook } from '@/lib/excel'
import { STANDARD_BODIES, STANDARD_CATEGORIES, type StandardBody, type StandardCategory, type StandardNote } from '@/types'
import { formatDate } from '@/lib/utils'

type Filter = StandardCategory | 'all'

const BLANK = {
  category: 'electrical' as StandardCategory,
  subcategory: '',
  body: 'IEC' as StandardBody,
  code: '',
  title: '',
  content: '',
  tags: '',
}

/** CATATAN STANDARD: ELECTRICAL / ELECTRONIC / OTHER, tiap-tiap PERKATEGORI. */
export function StandardsPage() {
  const { t, lang } = useLang()
  const { data, addStandard, addStandards, updateStandard, deleteStandard } = useData()

  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<StandardNote | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [pendingDelete, setPendingDelete] = useState<StandardNote | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)
  const [importing, setImporting] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.standards.filter((s) => {
      if (filter !== 'all' && s.category !== filter) return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.subcategory.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    })
  }, [data.standards, filter, query])

  /** Kelompokkan per PERKATEGORI seperti pada flowchart. */
  const grouped = useMemo(() => {
    const map = new Map<string, StandardNote[]>()
    for (const note of filtered) {
      const key = note.subcategory.trim() || t('categories.other')
      const list = map.get(key)
      if (list) list.push(note)
      else map.set(key, [note])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered, t])

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { all: data.standards.length, electrical: 0, electronic: 0, other: 0 }
    for (const s of data.standards) base[s.category] += 1
    return base
  }, [data.standards])

  const openNew = () => {
    setEditing(null)
    setForm(BLANK)
    setOpen(true)
  }

  const openEdit = (note: StandardNote) => {
    setEditing(note)
    setForm({
      category: note.category,
      subcategory: note.subcategory,
      body: note.body,
      code: note.code,
      title: note.title,
      content: note.content,
      tags: note.tags.join(', '),
    })
    setOpen(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() && !form.content.trim()) return
    const payload = {
      category: form.category,
      subcategory: form.subcategory.trim(),
      body: form.body,
      code: form.code.trim(),
      title: form.title.trim() || form.code.trim(),
      content: form.content.trim(),
      tags: form.tags
        .split(/[,;|]/)
        .map((x) => x.trim())
        .filter(Boolean),
    }
    if (editing) updateStandard(editing.id, payload)
    else addStandard(payload)
    setOpen(false)
  }

  const onImport = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setImporting(true)
    setNotice(null)
    try {
      const notes = await parseStandardsWorkbook(file)
      if (notes.length === 0) {
        setNotice({ tone: 'danger', text: t('standards.importNothing') })
      } else {
        addStandards(notes)
        setNotice({ tone: 'ok', text: t('standards.importDone', { n: notes.length }) })
      }
    } catch {
      setNotice({ tone: 'danger', text: t('standards.importFailed') })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <PageHeader
        title={t('standards.title')}
        subtitle={t('standards.subtitle')}
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void onImport(e.target.files)}
            />
            <GlassButton
              variant="glass"
              loading={importing}
              onClick={() => fileRef.current?.click()}
              icon={!importing && <UploadIcon className="h-4 w-4" />}
            >
              {t('standards.importExcel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={openNew} icon={<PlusIcon className="h-4 w-4" />}>
              {t('standards.newNote')}
            </GlassButton>
          </>
        }
      />

      <div className="stack-fade space-y-4">
        {notice && (
          <p
            className={
              notice.tone === 'ok'
                ? 'rounded-2xl border border-ok/25 bg-ok/10 px-4 py-3 text-[13px] font-semibold text-ok'
                : 'rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-[13px] font-semibold text-danger'
            }
          >
            {notice.text}
          </p>
        )}

        {/* --- filter kategori + pencarian --- */}
        <GlassCard className="space-y-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `${t('common.all')} (${counts.all})` },
              ...STANDARD_CATEGORIES.map((c) => ({
                value: c as Filter,
                label: `${t(`categories.${c}`)} (${counts[c]})`,
              })),
            ]}
          />
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint" />
            <GlassInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="pl-11"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            <GlassButton variant="ghost" size="sm" onClick={downloadStandardsTemplate} icon={<ExcelIcon className="h-4 w-4" />}>
              {t('standards.downloadTemplate')}
            </GlassButton>
            {data.standards.length > 0 && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => exportStandardsWorkbook(data.standards)}
                icon={<DownloadIcon className="h-4 w-4" />}
              >
                {t('standards.exportExcel')}
              </GlassButton>
            )}
            <span className="ml-auto">{t('standards.importHint')}</span>
          </div>
        </GlassCard>

        {/* --- daftar per perkategori --- */}
        {data.standards.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon={<BookIcon className="h-8 w-8" />}
              title={t('standards.empty')}
              hint={t('standards.emptyHint')}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <GlassButton variant="primary" onClick={openNew} icon={<PlusIcon className="h-4 w-4" />}>
                    {t('standards.newNote')}
                  </GlassButton>
                  <GlassButton variant="glass" onClick={() => fileRef.current?.click()} icon={<UploadIcon className="h-4 w-4" />}>
                    {t('standards.importExcel')}
                  </GlassButton>
                </div>
              }
            />
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard>
            <EmptyState icon={<SearchIcon className="h-7 w-7" />} title={t('common.empty')} />
          </GlassCard>
        ) : (
          grouped.map(([subcategory, notes]) => (
            <GlassCard key={subcategory}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="flex-1 truncate text-[15px] font-bold text-ink">{subcategory}</h2>
                <Badge tone="neutral">{t('standards.noteCount', { n: notes.length })}</Badge>
              </div>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="glass rounded-2xl px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{note.body}</Badge>
                      {note.code && (
                        <span className="font-mono text-[11.5px] font-semibold text-ink-soft">{note.code}</span>
                      )}
                      <Badge tone="neutral">{t(`categories.${note.category}`)}</Badge>
                      <span className="ml-auto text-[11px] text-ink-faint">
                        {formatDate(note.updatedAt, lang)}
                      </span>
                      <GlassButton
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('common.edit')}
                        onClick={() => openEdit(note)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('common.delete')}
                        onClick={() => setPendingDelete(note)}
                      >
                        <TrashIcon className="h-3.5 w-3.5 hover:text-danger" />
                      </GlassButton>
                    </div>
                    <p className="text-[14px] font-bold leading-snug text-ink">{note.title}</p>
                    {note.content && (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                        {note.content}
                      </p>
                    )}
                    {note.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {note.tags.map((tag) => (
                          <span key={tag} className="rounded-pill bg-ink/8 px-2 py-0.5 text-[10.5px] font-semibold text-ink-faint">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('common.edit') : t('standards.newNote')}
        size="lg"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </GlassButton>
            <GlassButton variant="primary" onClick={submit} disabled={!form.title.trim() && !form.content.trim()}>
              {t('common.save')}
            </GlassButton>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.category')}>
              <GlassSelect
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as StandardCategory })}
              >
                {STANDARD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </GlassSelect>
            </Field>
            <Field label={t('common.subcategory')}>
              <GlassInput
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                placeholder={t('standards.subcategoryPlaceholder')}
              />
            </Field>
            <Field label={t('standards.body')}>
              <GlassSelect
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value as StandardBody })}
              >
                {STANDARD_BODIES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </GlassSelect>
            </Field>
            <Field label={t('common.code')}>
              <GlassInput
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder={t('standards.codePlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('common.title')}>
            <GlassInput
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t('standards.titlePlaceholder')}
            />
          </Field>
          <Field label={t('common.description')}>
            <GlassTextarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={t('standards.contentPlaceholder')}
              rows={6}
            />
          </Field>
          <Field label={`${t('common.tags')} (${t('common.optional')})`}>
            <GlassInput
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="tray, fill ratio, kabel"
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteStandard(pendingDelete.id)}
        title={t('common.delete')}
        message={`${pendingDelete?.title ?? ''} — ${t('common.confirmDelete')}`}
      />
    </>
  )
}
