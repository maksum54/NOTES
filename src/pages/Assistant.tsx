import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { EmptyState, GlassButton, GlassCard, GlassInput, Spinner } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChatBubble } from './TaskDetail'
import {
  CameraIcon, DownloadIcon, ExcelIcon, FileIcon, PaperclipIcon, SendIcon, SparkIcon, TrashIcon, XIcon,
} from '@/components/icons'
import { assistantSystemPrompt, buildUserContent, chatStream, isAiReady } from '@/lib/ai'
import { downloadAiFile, estimateAiFileSize, extractFileBlocks, stripIncompleteBlock } from '@/lib/aiFile'
import { readJSON, writeJSON } from '@/lib/storage'
import { compressImage, nowISO, uid } from '@/lib/utils'
import type { ChatMessage } from '@/types'

/** Batas gambar per pertanyaan — menjaga ukuran body request tetap wajar. */
const MAX_IMAGES = 4

/** Asisten AI umum — konteksnya seluruh catatan standard milik user. */
export function AssistantPage() {
  const { t, lang } = useLang()
  const { data } = useData()
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    readJSON<ChatMessage[]>('assistantChat', []),
  )
  const [prompt, setPrompt] = useState('')
  const [streamText, setStreamText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [readingImages, setReadingImages] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // Gambar yang sudah terkirim, dipetakan per id pesan. SENGAJA disimpan di
  // memori saja dan terpisah dari `messages` — dengan begitu gambar mustahil
  // ikut tertulis ke localStorage, tanpa perlu ingat membuangnya di tiap jalur
  // persist. Konsekuensinya gambar hilang saat halaman dimuat ulang; itu memang
  // yang dipilih ("sekali pakai") dan sudah diberitahukan lewat `imageHint`.
  const [sentImages, setSentImages] = useState<Record<string, string[]>>({})
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  // Sumber kebenaran saat beberapa gambar dibaca berurutan — `pending` state
  // belum tentu sudah ter-flush di antara dua `await`.
  const pendingRef = useRef<string[]>([])
  const dragDepth = useRef(0)

  const updatePending = (next: string[]) => {
    pendingRef.current = next
    setPending(next)
  }

  /** Semua jalur masukan (paste, lampiran, kamera, drag & drop) lewat sini. */
  const addFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    let room = MAX_IMAGES - pendingRef.current.length
    if (room <= 0) return
    setReadingImages(true)
    setError(null)
    try {
      for (const file of images) {
        if (room <= 0) break
        try {
          // Kualitas sedikit lebih tinggi dari gambar task: di sini gambar
          // dibaca AI, bukan sekadar diarsipkan.
          const dataUrl = await compressImage(file, 1600, 0.85)
          room -= 1
          updatePending([...pendingRef.current, dataUrl])
        } catch (err) {
          setError(t('assistant.imageFailed', { msg: err instanceof Error ? err.message : 'unknown' }))
        }
      }
    } finally {
      setReadingImages(false)
    }
  }

  const clearAll = () => {
    setMessages([])
    setSentImages({})
    updatePending([])
  }

  // Selama AI menyusun jawaban, streaming digabung ke daftar pesan supaya
  // teks langsung terlihat kata demi kata tanpa menunggu jawaban utuh.
  const visible: ChatMessage[] =
    streamText !== null
      ? [...messages, { id: '__streaming', role: 'assistant', content: streamText, createdAt: '' }]
      : messages

  useEffect(() => {
    if (streamText === null) writeJSON('assistantChat', messages)
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamText])

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    const typed = prompt.trim()
    const images = pendingRef.current
    // Gambar saja sudah cukup untuk mengirim; teksnya diisi kalimat default.
    if ((!typed && images.length === 0) || streamText !== null || readingImages) return
    if (!isAiReady()) {
      setError(t('assistant.noKey'))
      return
    }

    const question = typed || t('assistant.imageDefaultAsk')
    const userMsg: ChatMessage = { id: uid('msg'), role: 'user', content: question, createdAt: nowISO() }
    const history = [...messages, userMsg]
    const nextSent = images.length > 0 ? { ...sentImages, [userMsg.id]: images } : sentImages
    setMessages(history)
    setSentImages(nextSent)
    setPrompt('')
    updatePending([])
    setError(null)
    setStreamText('')

    try {
      const reply = await chatStream(
        [
          { role: 'system', content: assistantSystemPrompt({ standards: data.standards, lang }) },
          // Batasi riwayat supaya prompt tidak membengkak tanpa batas.
          ...history.slice(-16).map((m) => ({
            role: m.role,
            content: buildUserContent(m.content, nextSent[m.id] ?? []),
          })),
        ],
        {
          onDelta: (full) => setStreamText(full),
          // Blok :::file (Excel perhitungan) bisa memakan ribuan token —
          // budget default mudah habis di model reasoning.
          maxTokens: 8192,
        },
      )
      setMessages((prev) => [
        ...prev,
        { id: uid('msg'), role: 'assistant', content: reply, createdAt: nowISO() },
      ])
    } catch (err) {
      setError(t('assistant.error', { msg: err instanceof Error ? err.message : 'unknown' }))
    } finally {
      setStreamText(null)
    }
  }

  return (
    <>
      <PageHeader
        title={t('assistant.title')}
        subtitle={t('assistant.subtitle')}
        action={
          messages.length > 0 && (
            <GlassButton variant="ghost" size="sm" onClick={clearAll} icon={<TrashIcon className="h-4 w-4" />}>
              {t('assistant.clear')}
            </GlassButton>
          )
        }
      />

      {/* Tinggi terkunci ke viewport: pesan panjang men-scroll di dalam kartu,
          bukan memanjangkan halaman. scrollbar-gutter menjaga lebar stabil. */}
      <GlassCard
        className="relative flex h-[calc(100dvh-11.5rem)] min-h-[460px] flex-col animate-fade-up [scrollbar-gutter:stable]"
        onDragEnter={(e) => {
          // Array.from dipakai supaya tetap jalan di browser yang `types`-nya
          // masih DOMStringList (tanpa .includes).
          if (!Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          dragDepth.current += 1
          setDragOver(true)
        }}
        onDragOver={(e) => {
          // Tanpa preventDefault, browser membuka gambar sebagai navigasi.
          e.preventDefault()
        }}
        onDragLeave={() => {
          // dragleave ikut terpicu saat kursor melewati anak elemen, jadi
          // hitung kedalamannya agar overlay tidak berkedip.
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragOver(false)
          void addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] border-2 border-dashed border-accent/60 bg-accent/10 backdrop-blur-sm">
            <span className="rounded-2xl bg-ink/75 px-4 py-2 text-[13px] font-semibold text-white">
              {t('assistant.dropHere')}
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <EmptyState
              icon={<SparkIcon className="h-8 w-8" />}
              title={t('assistant.empty')}
              hint={isAiReady() ? t('assistant.subtitle') : t('ai.setupNeeded')}
              action={
                !isAiReady() && (
                  <Link to="/settings">
                    <GlassButton variant="primary" size="sm">
                      {t('assistant.goSettings')}
                    </GlassButton>
                  </Link>
                )
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {visible.map((m) => (
                <AssistantBubble
                  key={m.id}
                  message={m}
                  images={sentImages[m.id]}
                  streaming={m.id === '__streaming'}
                />
              ))}
            </ul>
          )}
          {/* Slot indicator tingginya tetap (min-h), jadi footer tidak naik-turun. */}
          <div className="flex min-h-9 items-center gap-2 pt-3 text-[13px] text-ink-faint">
            {streamText !== null && (!streamText || streamText.trim().length === 0) && (
              <>
                <Spinner />
                {t('assistant.thinking')}
              </>
            )}
          </div>
          <div ref={endRef} />
        </div>

        {error && (
          <p className="mt-3 rounded-2xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[12.5px] text-danger">
            {error}
          </p>
        )}

        {/* Dua input tersembunyi: satu untuk memilih dari galeri/file, satu lagi
            `capture` untuk langsung membuka kamera belakang di HP. Di desktop
            atribut capture diabaikan browser, jadi tombolnya tetap aman. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = '' // supaya file yang sama bisa dipilih lagi
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />

        <form onSubmit={ask} className="mt-3 border-t hairline pt-3">
          {/* Baris alat: tombol lampiran & kamera selalu terlihat, dan thumbnail
              gambar tertunda ikut mengalir di baris yang sama. Sengaja TIDAK
              ditaruh sebaris dengan kolom ketik — di layar HP kolom ketik jadi
              terlalu sempit kalau harus berbagi tempat dengan tiga tombol. */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <GlassButton
              type="button"
              variant="glass"
              size="icon"
              className="shrink-0"
              loading={readingImages}
              disabled={streamText !== null || readingImages || pending.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
              aria-label={t('assistant.attach')}
              title={t('assistant.attach')}
            >
              <PaperclipIcon className="h-[18px] w-[18px]" />
            </GlassButton>
            <GlassButton
              type="button"
              variant="glass"
              size="icon"
              className="shrink-0"
              disabled={streamText !== null || readingImages || pending.length >= MAX_IMAGES}
              onClick={() => cameraRef.current?.click()}
              aria-label={t('assistant.camera')}
              title={t('assistant.camera')}
            >
              <CameraIcon className="h-[18px] w-[18px]" />
            </GlassButton>
            {pending.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <img src={src} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-ink/10" />
                <button
                  type="button"
                  onClick={() => updatePending(pending.filter((_, j) => j !== i))}
                  aria-label={t('assistant.removeImage')}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white shadow-md transition hover:opacity-80"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <GlassInput
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.items)
                  .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => f !== null)
                // Hanya cegah default kalau memang ada gambar; paste teks biasa
                // harus tetap masuk ke kolom input seperti normal.
                if (files.length > 0) {
                  e.preventDefault()
                  void addFiles(files)
                }
              }}
              placeholder={t('assistant.placeholder')}
              disabled={streamText !== null}
              className="min-w-0"
            />
            <GlassButton
              type="submit"
              variant="primary"
              size="icon"
              className="h-[46px] w-[46px] shrink-0"
              disabled={(!prompt.trim() && pending.length === 0) || streamText !== null || readingImages}
              aria-label={t('task.send')}
            >
              <SendIcon className="h-[18px] w-[18px]" />
            </GlassButton>
          </div>

          {pending.length > 0 && (
            <p className="mt-1.5 text-[11.5px] text-ink-faint">{t('assistant.imageHint')}</p>
          )}
        </form>
      </GlassCard>
    </>
  )
}

/**
 * Bubble jawaban assistant yang sadar blok :::file — JSON pembentuk file
 * disembunyikan dari tampilan dan diganti kartu unduh.
 */
function AssistantBubble({
  message,
  images = [],
  streaming,
}: {
  message: ChatMessage
  images?: string[]
  streaming?: boolean
}) {
  const { t } = useLang()
  if (message.role === 'user') {
    return <ChatBubble message={message} images={images} />
  }

  // Saat streaming, blok yang belum selesai ditulis disembunyikan supaya
  // JSON-nya tidak mengalir di layar; parsing menunggu blok utuh.
  const raw = streaming ? stripIncompleteBlock(message.content).text : message.content
  const { text, files } = extractFileBlocks(raw)
  const showBubble = text.trim().length > 0

  return (
    <>
      {showBubble && <ChatBubble message={{ ...message, content: text }} images={images} />}
      {files.map((file) => (
        <FileCard key={file.filename} file={file} />
      ))}
      {streaming && !showBubble && files.length === 0 && (
        <li className="flex items-center gap-2 text-[13px] text-ink-faint">{t('assistant.filePreparing')}</li>
      )}
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Kartu file hasil AI — klik untuk membuat & mengunduh file aslinya. */
function FileCard({ file }: { file: import('@/lib/aiFile').AiFile }) {
  const { t } = useLang()
  const isSheet = file.kind === 'xlsx'
  const Icon = isSheet || /\.csv$/i.test(file.filename) ? ExcelIcon : FileIcon
  return (
    <li className="flex justify-start">
      <div className="glass flex max-w-[85%] items-center gap-3 rounded-2xl px-3.5 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-ink">{file.filename}</span>
          <span className="block truncate text-[11px] text-ink-faint">
            {t('assistant.fileReady')} · {formatSize(estimateAiFileSize(file))}
          </span>
        </span>
        <GlassButton
          variant="primary"
          size="sm"
          className="shrink-0"
          icon={<DownloadIcon className="h-4 w-4" />}
          onClick={() => downloadAiFile(file)}
        >
          {t('assistant.fileDownload')}
        </GlassButton>
      </div>
    </li>
  )
}
