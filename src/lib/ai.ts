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

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
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

interface CompletionChoice {
  message?: { content?: string }
}
interface CompletionResponse {
  choices?: CompletionChoice[]
  error?: { message?: string }
}

/** Satu panggilan chat completion. */
export async function chat(
  messages: AiMessage[],
  opts: { temperature?: number; signal?: AbortSignal; maxTokens?: number } = {},
): Promise<string> {
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
        max_tokens: opts.maxTokens ?? 1500,
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

  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new AiError('empty-response', res.status)
  return content.trim()
}

/** Ping ringan untuk tombol "Tes Koneksi" di Pengaturan. */
export async function testConnection(): Promise<string> {
  return chat([{ role: 'user', content: 'Reply with exactly: OK' }], { maxTokens: 8, temperature: 0 })
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
    { temperature: 0.1, signal: args.signal, maxTokens: 1800 },
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
