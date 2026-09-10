import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { EmptyState, GlassButton, GlassCard, GlassInput, Spinner } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChatBubble } from './TaskDetail'
import { SendIcon, SparkIcon, TrashIcon } from '@/components/icons'
import { assistantSystemPrompt, chatStream, isAiReady } from '@/lib/ai'
import { readJSON, writeJSON } from '@/lib/storage'
import { nowISO, uid } from '@/lib/utils'
import type { ChatMessage } from '@/types'

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
  const endRef = useRef<HTMLDivElement>(null)

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
    const question = prompt.trim()
    if (!question || streamText !== null) return
    if (!isAiReady()) {
      setError(t('assistant.noKey'))
      return
    }

    const history = [
      ...messages,
      { id: uid('msg'), role: 'user' as const, content: question, createdAt: nowISO() },
    ]
    setMessages(history)
    setPrompt('')
    setError(null)
    setStreamText('')

    try {
      const reply = await chatStream(
        [
          { role: 'system', content: assistantSystemPrompt({ standards: data.standards, lang }) },
          // Batasi riwayat supaya prompt tidak membengkak tanpa batas.
          ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
        ],
        { onDelta: (full) => setStreamText(full) },
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
            <GlassButton variant="ghost" size="sm" onClick={() => setMessages([])} icon={<TrashIcon className="h-4 w-4" />}>
              {t('assistant.clear')}
            </GlassButton>
          )
        }
      />

      {/* Tinggi terkunci ke viewport: pesan panjang men-scroll di dalam kartu,
          bukan memanjangkan halaman. scrollbar-gutter menjaga lebar stabil. */}
      <GlassCard className="flex h-[calc(100dvh-11.5rem)] min-h-[460px] flex-col animate-fade-up [scrollbar-gutter:stable]">
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
                <ChatBubble key={m.id} message={m} />
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

        <form onSubmit={ask} className="mt-3 flex gap-2 border-t hairline pt-3">
          <GlassInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('assistant.placeholder')}
            disabled={streamText !== null}
          />
          <GlassButton
            type="submit"
            variant="primary"
            size="icon"
            className="h-[46px] w-[46px] shrink-0"
            disabled={!prompt.trim() || streamText !== null}
            aria-label={t('task.send')}
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </GlassButton>
        </form>
      </GlassCard>
    </>
  )
}
