import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { EmptyState, GlassButton, GlassCard, GlassInput, Spinner } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChatBubble } from './TaskDetail'
import { SendIcon, SparkIcon, TrashIcon } from '@/components/icons'
import { assistantSystemPrompt, chat, isAiReady } from '@/lib/ai'
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
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    writeJSON('assistantChat', messages)
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    const question = prompt.trim()
    if (!question || thinking) return
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
    setThinking(true)
    setError(null)

    try {
      const reply = await chat([
        { role: 'system', content: assistantSystemPrompt({ standards: data.standards, lang }) },
        // Batasi riwayat supaya prompt tidak membengkak tanpa batas.
        ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
      ])
      setMessages((prev) => [
        ...prev,
        { id: uid('msg'), role: 'assistant', content: reply, createdAt: nowISO() },
      ])
    } catch (err) {
      setError(t('assistant.error', { msg: err instanceof Error ? err.message : 'unknown' }))
    } finally {
      setThinking(false)
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

      <GlassCard className="flex min-h-[60dvh] flex-col animate-fade-up">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
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
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
            </ul>
          )}
          {thinking && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-ink-faint">
              <Spinner />
              {t('assistant.thinking')}
            </div>
          )}
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
            disabled={thinking}
          />
          <GlassButton
            type="submit"
            variant="primary"
            size="icon"
            className="h-[46px] w-[46px] shrink-0"
            disabled={!prompt.trim() || thinking}
            aria-label={t('task.send')}
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </GlassButton>
        </form>
      </GlassCard>
    </>
  )
}
