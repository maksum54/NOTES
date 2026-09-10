import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { useTheme } from '@/context/ThemeContext'
import { Field, GlassButton, GlassCard, GlassInput } from '@/components/glass/Glass'
import { Segmented } from '@/components/glass/Segmented'
import { GlobeIcon, GoogleIcon, LockIcon, MonitorIcon, MoonIcon, SunIcon } from '@/components/icons'
import { Logo } from '@/components/layout/AppShell'
import type { Lang } from '@/i18n'
import type { ThemeChoice } from '@/context/ThemeContext'

/** MODE LOGIN — Google (sekaligus izin Drive) atau mode lokal berpasscode. */
export function LoginPage() {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()
  const { account, locked, googleAvailable, signInWithGoogle, signInLocal, unlock } = useAuth()

  const [name, setName] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isUnlockScreen = locked && account !== null

  const handleGoogle = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'google-not-configured'
          ? t('auth.googleNotConfigured')
          : t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleLocal = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isUnlockScreen) {
      if (!unlock(passcode)) {
        setError(t('auth.passcodeWrong'))
        setPasscode('')
      }
      return
    }
    signInLocal(name, passcode)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      {/* Kontrol tema & bahasa tetap tersedia sebelum login. */}
      <div className="fixed right-4 top-4 z-20 flex gap-2 safe-top">
        <Segmented<Lang>
          value={lang}
          onChange={setLang}
          size="sm"
          options={[
            { value: 'id', label: 'ID' },
            { value: 'en', label: 'EN' },
          ]}
        />
        <div className="glass flex gap-0.5 rounded-pill p-1">
          {(
            [
              ['light', SunIcon],
              ['dark', MoonIcon],
              ['system', MonitorIcon],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-pressed={theme === value}
              onClick={() => setTheme(value as ThemeChoice)}
              className={
                theme === value
                  ? 'grid h-7 w-7 place-items-center rounded-pill bg-glass-bg/45 text-ink'
                  : 'grid h-7 w-7 place-items-center rounded-pill text-ink-faint hover:text-ink'
              }
            >
              <Icon className="h-[15px] w-[15px]" />
            </button>
          ))}
        </div>
      </div>

      <GlassCard strong className="w-full max-w-md animate-sheet-up p-7 sm:p-8" padded={false}>
        <div className="flex flex-col items-center px-7 pb-7 pt-8 text-center sm:px-8">
          <Logo />
          <h1 className="mt-4 text-[27px] font-extrabold tracking-tight text-ink">
            {isUnlockScreen ? t('auth.unlock') : t('auth.welcome')}
          </h1>
          <p className="mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-ink-faint">
            {isUnlockScreen ? `${t('auth.signedInAs')} ${account?.name}` : t('auth.subtitle')}
          </p>
        </div>

        <div className="space-y-4 px-7 pb-8 sm:px-8">
          {!isUnlockScreen && (
            <>
              <GlassButton
                variant="glass"
                size="lg"
                className="w-full"
                loading={busy}
                onClick={handleGoogle}
                icon={!busy && <GoogleIcon />}
              >
                {t('auth.withGoogle')}
              </GlassButton>
              <p className="-mt-1.5 text-center text-[12px] text-ink-faint">{t('auth.withGoogleHint')}</p>
              {!googleAvailable && (
                <p className="rounded-2xl border border-warn/25 bg-warn/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-warn">
                  {t('auth.googleNotConfigured')}
                </p>
              )}

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-ink/12" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  {t('auth.orDivider')}
                </span>
                <span className="h-px flex-1 bg-ink/12" />
              </div>
            </>
          )}

          <form onSubmit={handleLocal} className="space-y-3.5">
            {!isUnlockScreen && (
              <Field label={t('auth.displayName')}>
                <GlassInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.displayNamePlaceholder')}
                  autoComplete="name"
                  required
                />
              </Field>
            )}

            <Field
              label={t('auth.passcode')}
              hint={isUnlockScreen ? undefined : t('auth.passcodeHint')}
              error={error ?? undefined}
            >
              <GlassInput
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete={isUnlockScreen ? 'current-password' : 'new-password'}
                placeholder="••••••"
                className="text-center text-xl tracking-[0.5em]"
                autoFocus={isUnlockScreen}
                required={isUnlockScreen}
              />
            </Field>

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              icon={isUnlockScreen ? <LockIcon className="h-4 w-4" /> : undefined}
            >
              {isUnlockScreen ? t('auth.unlock') : t('auth.localMode')}
            </GlassButton>
            {!isUnlockScreen && (
              <p className="text-center text-[12px] leading-relaxed text-ink-faint">
                {t('auth.localModeHint')}
              </p>
            )}
          </form>
        </div>

        <div className="flex items-center justify-center gap-1.5 border-t hairline px-7 py-3.5 text-[11px] text-ink-faint">
          <GlobeIcon className="h-3.5 w-3.5" />
          {t('app.tagline')}
        </div>
      </GlassCard>
    </div>
  )
}
