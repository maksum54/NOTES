import { Component, type ErrorInfo, type ReactNode } from 'react'
import { cx } from '@/lib/utils'

/**
 * Pengaman crash: kalau render melempar error (mis. chunk gagal dimuat
 * setelah deploy baru, data lama tak terduga), tampilkan pesan + tombol
 * muat ulang — bukan halaman blank tanpa informasi.
 */
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="glass max-w-md rounded-glass p-6">
          <p className="text-[16px] font-bold text-danger">Terjadi kesalahan</p>
          <p className="mt-2 break-words text-[13px] leading-relaxed text-ink-faint">
            {error.message || 'unknown'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={cx(
              'mt-4 inline-flex h-10 items-center rounded-xl bg-accent px-5 text-[14px] font-semibold text-white',
              'shadow-[0_6px_20px_-6px_rgb(var(--accent)/0.7)] hover:brightness-110',
            )}
          >
            Muat Ulang
          </button>
        </div>
      </div>
    )
  }
}
