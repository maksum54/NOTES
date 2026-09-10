import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/lib/utils'
import { GlassButton } from './Glass'
import { XIcon } from '@/components/icons'
import { useLang } from '@/context/LangContext'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  full: 'max-w-6xl',
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  const { t } = useLang()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-black/35 backdrop-blur-md dark:bg-black/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'glass-strong glass-sheen relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'animate-sheet-up rounded-t-[28px] outline-none sm:rounded-glass',
          SIZES[size],
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start gap-3 border-b hairline px-5 pb-4 pt-5 sm:px-6">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>}
              {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-ink-faint">{subtitle}</p>}
            </div>
            <GlassButton variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
              <XIcon />
            </GlassButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t hairline px-5 py-4 safe-bottom sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Konfirmasi destruktif — dipakai untuk semua aksi hapus. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  tone = 'danger',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}) {
  const { t } = useLang()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </GlassButton>
          <GlassButton
            variant={tone}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel ?? t('common.delete')}
          </GlassButton>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-ink-soft">{message}</p>
    </Modal>
  )
}
