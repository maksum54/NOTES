import { useEffect, useState } from 'react'
import { useLang } from '@/context/LangContext'
import { readRaw, writeRaw } from '@/lib/storage'
import { GlassButton } from '@/components/glass/Glass'
import { DownloadIcon, XIcon } from '@/components/icons'
import { Logo } from './AppShell'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Tombol "Pasang Aplikasi" versi sendiri (bukan prompt bawaan browser),
 * muncul setelah user sempat berinteraksi, dan diam permanen kalau ditolak.
 */
export function InstallPrompt() {
  const { t } = useLang()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (readRaw('installDismissed') === '1') return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      // Tunggu sebentar supaya tidak menyambar user begitu app terbuka.
      setTimeout(() => setVisible(true), 25_000)
    }
    const onInstalled = () => {
      setVisible(false)
      writeRaw('installDismissed', '1')
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible || !deferred) return null

  const dismiss = () => {
    writeRaw('installDismissed', '1')
    setVisible(false)
  }

  const install = async () => {
    setVisible(false)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'dismissed') writeRaw('installDismissed', '1')
    } catch {
      /* diamkan */
    }
    setDeferred(null)
  }

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 animate-sheet-up lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[380px]">
      <div className="glass-strong glass-sheen flex items-center gap-3 rounded-glass p-3.5">
        <Logo />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-ink">{t('app.install')}</p>
          <p className="truncate text-[12px] text-ink-faint">{t('app.tagline')}</p>
        </div>
        <GlassButton variant="primary" size="sm" onClick={install} icon={<DownloadIcon className="h-4 w-4" />}>
          {t('common.add')}
        </GlassButton>
        <GlassButton variant="ghost" size="icon" onClick={dismiss} aria-label={t('common.close')}>
          <XIcon className="h-4 w-4" />
        </GlassButton>
      </div>
    </div>
  )
}
