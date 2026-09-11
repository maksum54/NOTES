import type { AiReview, Finding, StandardNote } from '@/types'
import { nowISO, uid } from './utils'
import { readRaw, writeRaw } from './storage'

/* ============================================================
   Klien AI — endpoint vikey.ai (kompatibel OpenAI chat/completions)

     curl https://api.vikey.ai/v1/chat/completions \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer YOUR_API_KEY" \
       -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"Hello!"}]}'
   ============================================================ */

const DEFAULT_BASE_URL = import.meta.env.VITE_VIKEY_BASE_URL || 'https://api.vikey.ai/v1'
const DEFAULT_MODEL = import.meta.env.VITE_VIKEY_MODEL || 'gpt-4o-mini'
const ENV_KEY = import.meta.env.VITE_VIKEY_API_KEY || ''

export interface AiConfig {
  apiKey: string
  model: string
  baseUrl: string
}

/**
 * Rapikan base URL yang diketik user.
 *
 * Endpoint yang dipanggil adalah `<base>/chat/completions`, jadi base HARUS
 * sudah memuat prefix versi. Mengetik "https://api.vikey.ai" tanpa "/v1"
 * menghasilkan HTTP 404 — kasus yang gampang sekali terjadi, jadi di sini
 * "/v1" ditambahkan sendiri kalau base-nya masih polos (host saja).
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return DEFAULT_BASE_URL
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    // Path kosong ("/") berarti user hanya menulis host -> lengkapi dengan /v1.
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/v1'
      return url.toString().replace(/\/+$/, '')
    }
    return withProtocol
  } catch {
    return withProtocol
  }
}

export function getAiConfig(): AiConfig {
  return {
    // Key milik user (localStorage) menang atas key .env dev.
    apiKey: readRaw('aiKey') ?? ENV_KEY,
    model: readRaw('aiModel') || DEFAULT_MODEL,
    baseUrl: normalizeBaseUrl(readRaw('aiBaseUrl') || DEFAULT_BASE_URL),
  }
}

export function setAiConfig(cfg: Partial<AiConfig>): void {
  if (cfg.apiKey !== undefined) writeRaw('aiKey', cfg.apiKey.trim())
  if (cfg.model !== undefined) writeRaw('aiModel', cfg.model.trim() || DEFAULT_MODEL)
  if (cfg.baseUrl !== undefined) writeRaw('aiBaseUrl', cfg.baseUrl.trim() || DEFAULT_BASE_URL)
}

export function isAiReady(): boolean {
  return getAiConfig().apiKey.trim().length > 0
}

export const AI_DEFAULTS = { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL }

/**
 * Isi pesan bisa berupa teks biasa atau daftar bagian (teks + gambar).
 * Bentuk array ini format multimodal [OI] yang dipakai endpoint vikey.ai.
 */
export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | AiContentPart[]
}

/**
 * Susun isi pesan user dari teks + gambar.
 *
 * Tanpa gambar, hasilnya tetap string biasa — payload untuk pemakaian yang
 * sudah ada tidak berubah sama sekali. Gambar ditaruh SEBELUM teks karena
 * urutan itu yang paling aman di berbagai model vision.
 */
export function buildUserContent(text: string, imageDataUrls: string[] = []): string | AiContentPart[] {
  if (imageDataUrls.length === 0) return text
  return [
    ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    ...(text ? [{ type: 'text' as const, text }] : []),
  ]
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export interface ChatOpts {
  temperature?: number
  signal?: AbortSignal
  maxTokens?: number
  onDelta?: (full: string) => void
}

/** Budget token default — aman untuk hampir semua model. */
const DEFAULT_MAX_TOKENS = 4096

/**
 * Model "reasoning" (mis. deepseek-v4, o-series) berpikir dulu sebelum menjawab,
 * dan token untuk berpikir itu IKUT dihitung ke `max_tokens`. Kalau budgetnya
 * kekecilan, provider membalas error semacam:
 *
 *   "The model spent its entire max_tokens budget on reasoning and returned no
 *    answer. Increase max_tokens ... or disable extended thinking."
 *
 * Ini penting dibedakan: koneksi, API key, dan Base URL semuanya BENAR — yang
 * habis cuma budget token. Jadi error ini ditangkap lalu diulang sekali dengan
 * budget jauh lebih longgar, bukan diteruskan mentah-mentah ke user.
 */
const REASONING_BUDGET_RE = /budget on reasoning|reasoning tokens count|max_tokens budget|extended thinking/i

/** Budget cadangan saat model kehabisan token untuk reasoning. */
const REASONING_RETRY_MAX_TOKENS = 32768

function isReasoningBudgetError(err: unknown): boolean {
  return err instanceof AiError && REASONING_BUDGET_RE.test(err.message)
}

interface CompletionChoice {
  message?: { content?: string | AiContentPart[] }
}
interface CompletionResponse {
  choices?: CompletionChoice[]
  error?: { message?: string }
}

/** Satu panggilan chat completion, tanpa retry. */
async function chatOnce(messages: AiMessage[], opts: ChatOpts, maxTokens: number): Promise<string> {
  const { apiKey, model, baseUrl } = getAiConfig()
  if (!apiKey) throw new AiError('missing-api-key')

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: maxTokens,
      }),
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AiError('network-error')
  }

  const text = await res.text()
  let json: CompletionResponse = {}
  try {
    json = JSON.parse(text) as CompletionResponse
  } catch {
    if (!res.ok) throw new AiError(`HTTP ${res.status}`, res.status)
    throw new AiError('invalid-response', res.status)
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new AiError(`HTTP 404 — endpoint tidak ditemukan. Cek Base URL (harus memuat /v1) dan Model ID.`, 404)
    }
    throw new AiError(json.error?.message || `HTTP ${res.status}`, res.status)
  }

  const raw = json.choices?.[0]?.message?.content
  // Sebagian provider membalas dengan daftar bagian, bukan string tunggal.
  const content = Array.isArray(raw)
    ? raw.map((part) => (part.type === 'text' ? part.text : '')).join('')
    : raw
  if (typeof content !== 'string') throw new AiError('empty-response', res.status)
  opts.onDelta?.(content.trim())
  return content.trim()
}

/**
 * Satu panggilan chat completion.
 *
 * Kalau model kehabisan budget token untuk reasoning, panggilan diulang sekali
 * dengan budget yang jauh lebih longgar — supaya model reasoning tetap bisa
 * dipakai tanpa user harus menaikkan `max_tokens` sendiri.
 */
export async function chat(messages: AiMessage[], opts: ChatOpts = {}): Promise<string> {
  const budget = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  try {
    return await chatOnce(messages, opts, budget)
  } catch (err) {
    if (!isReasoningBudgetError(err)) throw err
    try {
      return await chatOnce(messages, opts, Math.max(budget * 4, REASONING_RETRY_MAX_TOKENS))
    } catch {
      // Retry ikut gagal (mis. provider membatasi `max_tokens`) — tampilkan
      // error aslinya supaya penyebabnya tetap terbaca.
      throw err
    }
  }
}

/**
 * Chat completion dengan streaming (SSE) — jawaban mulai terlihat jauh lebih
 * cepat karena tiap potongan teks langsung diteruskan lewat `onDelta`.
 * Kalau endpoint tidak mendukung `stream: true`, otomatis jatuh ke `chat()`.
 */
export async function chatStream(messages: AiMessage[], opts: ChatOpts = {}): Promise<string> {
  const { apiKey, model, baseUrl } = getAiConfig()
  if (!apiKey) throw new AiError('missing-api-key')

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
      }),
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AiError('network-error')
  }

  if (!res.ok) {
    const text = await res.text()
    let msg = `HTTP ${res.status}`
    try {
      msg = (JSON.parse(text) as CompletionResponse).error?.message || msg
    } catch { /* biar pakai pesan default */ }
    if (res.status === 404) {
      throw new AiError(`HTTP 404 — endpoint tidak ditemukan. Cek Base URL (harus memuat /v1) dan Model ID.`, 404)
    }
    // Parameter stream ditolak, atau model kehabisan budget reasoning -> ulangi
    // lewat jalur non-stream; retry budgetnya sudah ditangani di `chat()`.
    if (res.status === 400 || res.status === 422 || REASONING_BUDGET_RE.test(msg)) {
      return chat(messages, { ...opts, onDelta: undefined })
    }
    throw new AiError(msg, res.status)
  }

  if (!res.body) return chat(messages, { ...opts, onDelta: undefined })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let done = false

  while (!done) {
    const { value, done: eof } = await reader.read()
    if (eof) break
    buffer += decoder.decode(value, { stream: true })

    // Proses baris lengkap saja; sisa baris terpotong ditahan di buffer.
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') {
        done = true
        break
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string | AiContentPart[] } }[]
        }
        // Sebagian provider mengirim delta sebagai array bagian (teks/gambar);
        // ambil potongan teksnya saja supaya tidak ikut ter-stringify.
        const raw = json.choices?.[0]?.delta?.content
        const delta = Array.isArray(raw)
          ? raw.map((part) => (part.type === 'text' ? part.text : '')).join('')
          : raw
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta
          opts.onDelta?.(full)
        }
      } catch { /* baris JSON rusak — lewati */ }
    }
  }

  // Sebagian provider menulis jawaban penuh di field message, bukan delta.
  if (full.trim().length === 0) return chat(messages, { ...opts, onDelta: undefined })
  return full.trim()
}

/**
 * Ping ringan untuk tombol "Tes Koneksi" di Pengaturan.
 *
 * Jangan pernah memakai budget token kecil di sini. Model reasoning bisa
 * memakai ribuan token hanya untuk berpikir sebelum menulis "OK", jadi angka
 * seperti 8 membuat tes ini gagal ("spent its entire max_tokens budget on
 * reasoning") padahal API key dan Base URL-nya sudah benar — dan user pun
 * mengira koneksinya yang bermasalah.
 */
export async function testConnection(): Promise<string> {
  return chat([{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0 })
}

/* ---------- Konteks standard yang disuntikkan ke prompt ---------- */

const MAX_STANDARDS_IN_PROMPT = 60

export function buildStandardsContext(standards: StandardNote[]): string {
  if (standards.length === 0) return '(Belum ada catatan standard yang diunggah user.)'
  return standards
    .slice(0, MAX_STANDARDS_IN_PROMPT)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.body} ${s.code} — ${s.title}\n` +
        `    kategori: ${s.category} / ${s.subcategory || '-'}\n` +
        `    isi: ${s.content.slice(0, 700)}`,
    )
    .join('\n')
}

/* ---------- Review SUMMARY CLIENT terhadap standard ---------- */

const REVIEW_SYSTEM = `Kamu adalah reviewer teknis MEP/elektrikal senior yang menguasai standard IEC, NEC, PUIL (SNI 0225), dan SNI lain.

Tugasmu: membaca "summary client" (permintaan/ringkasan dari client untuk sebuah building) dan menilai apakah ada yang menyimpang dari standard.

Aturan:
- Utamakan CATATAN STANDARD milik user di bawah sebagai acuan utama. Kalau tidak ada yang relevan, boleh pakai pengetahuan umum IEC/NEC/PUIL/SNI, dan tandai referensinya seadanya.
- Hanya laporkan temuan yang benar-benar bisa dibenarkan dari teks summary. Jangan mengarang pelanggaran.
- Kalau summary aman, kembalikan findings kosong.
- severity: "critical" untuk bahaya keselamatan / pelanggaran jelas, "warning" untuk berisiko atau ambigu, "info" untuk saran perbaikan.

Balas HANYA JSON valid, tanpa markdown fence, dengan bentuk persis:
{"verdict":"<2-3 kalimat kesimpulan>","findings":[{"severity":"critical|warning|info","reference":"<klausul, mis. PUIL 2011 3.24.2>","issue":"<apa yang menyimpang>","recommendation":"<tindakan perbaikan konkret>"}]}`

function stripFence(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

function coerceSeverity(v: unknown): Finding['severity'] {
  return v === 'critical' || v === 'warning' || v === 'info' ? v : 'warning'
}

/** Parse jawaban model jadi AiReview; toleran terhadap output yang agak berantakan. */
export function parseReview(raw: string, reviewedText: string, model: string): AiReview {
  const cleaned = stripFence(raw)
  let parsed: { verdict?: unknown; findings?: unknown } = {}
  try {
    parsed = JSON.parse(cleaned) as typeof parsed
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1)) as typeof parsed
      } catch {
        parsed = {}
      }
    }
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : []
  const findings: Finding[] = rawFindings.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>
    return {
      id: uid('fnd'),
      severity: coerceSeverity(o.severity),
      reference: String(o.reference ?? '—'),
      issue: String(o.issue ?? ''),
      recommendation: String(o.recommendation ?? ''),
    }
  })

  return {
    id: uid('rev'),
    createdAt: nowISO(),
    model,
    reviewedText,
    findings: findings.filter((f) => f.issue.trim().length > 0),
    // Kalau model gagal memberi JSON, tetap tampilkan teks mentahnya daripada kosong.
    verdict: String(parsed.verdict ?? cleaned.slice(0, 600) ?? '').trim(),
  }
}

export async function reviewSummary(args: {
  summary: string
  standards: StandardNote[]
  projectName: string
  buildingName: string
  lang: 'id' | 'en'
  signal?: AbortSignal
}): Promise<AiReview> {
  const { model } = getAiConfig()
  const languageLine =
    args.lang === 'id'
      ? 'Tulis verdict, issue, dan recommendation dalam Bahasa Indonesia.'
      : 'Write verdict, issue, and recommendation in English.'

  const user = [
    `PROJECT: ${args.projectName}`,
    `BUILDING: ${args.buildingName}`,
    '',
    'CATATAN STANDARD MILIK USER:',
    buildStandardsContext(args.standards),
    '',
    'SUMMARY CLIENT YANG DIREVIEW:',
    args.summary,
    '',
    languageLine,
  ].join('\n')

  const raw = await chat(
    [
      { role: 'system', content: REVIEW_SYSTEM },
      { role: 'user', content: user },
    ],
    { temperature: 0.1, signal: args.signal, maxTokens: 4096 },
  )

  return parseReview(raw, args.summary, model)
}

/* ---------- Chat umum / chat per-task ---------- */

export function assistantSystemPrompt(args: {
  standards: StandardNote[]
  lang: 'id' | 'en'
  extraContext?: string
}): string {
  return [
    'Kamu asisten teknis untuk engineer MEP/elektrikal di Indonesia.',
    'Kamu paham standard IEC, NEC, PUIL (SNI 0225), dan SNI terkait instalasi listrik gedung industri.',
    'Jawab ringkas, praktis, dan sebutkan acuan klausul kalau relevan.',
    'Kalau tidak yakin, katakan tidak yakin — jangan mengarang nomor klausul.',
    args.lang === 'id' ? 'Jawab dalam Bahasa Indonesia.' : 'Answer in English.',
    '',
    'CATATAN STANDARD MILIK USER (acuan utama):',
    buildStandardsContext(args.standards),
    args.extraContext ? `\nKONTEKS TAMBAHAN:\n${args.extraContext}` : '',
  ].join('\n')
}
