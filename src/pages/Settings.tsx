import { useEffect, useRef, useState } from 'react'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { useTheme, type ThemeChoice } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { Badge, Field, GlassButton, GlassCard, GlassInput } from '@/components/glass/Glass'
import { ConfirmDialog } from '@/components/glass/Modal'
import { Segmented } from '@/components/glass/Segmented'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CloudIcon, DownloadIcon, GearIcon, GlobeIcon, LogoutIcon, MonitorIcon,
  MoonIcon, RefreshIcon, SparkIcon, SunIcon, TrashIcon, UploadIcon,
} from '@/components/icons'
import { AI_DEFAULTS, getAiConfig, normalizeBaseUrl, setAiConfig, testConnection } from '@/lib/ai'
import {
  backupToDrive, connectDrive, disconnectDrive, driveLastSync, isAutoSyncOn,
  isDriveConfigured, isDriveConnected, restoreFromDrive, setAutoSync,
} from '@/lib/drive'
import { isAutoStickyOn, setAutoSticky, supportsAlwaysOnTop, supportsDetachedWindow } from '@/lib/detachedWindow'
import { clearAppStorage, storageBytes } from '@/lib/storage'
import { downloadBlob, formatBytes, formatDateTime } from '@/lib/utils'
import type { AppData } from '@/types'
import type { Lang } from '@/i18n'

type Notice = { tone: 'ok' | 'danger'; text: string } | null

export function SettingsPage() {
  const { t, lang, setLang } = useLang()
  const { theme, setTheme } = useTheme()
  const { account, signOut } = useAuth()
  const { data, replaceAll, resetAll, syncNow, syncing, syncError } = useData()

  const jsonRef = useRef<HTMLInputElement>(null)
  const [ai, setAi] = useState(getAiConfig)
  const [aiNotice, setAiNotice] = useState<Notice>(null)
  const [testing, setTesting] = useState(false)

  const [driveConnected, setDriveConnected] = useState(isDriveConnected)
  const [autoSync, setAutoSyncState] = useState(isAutoSyncOn)
  const [lastSync, setLastSync] = useState(driveLastSync)
  const [driveBusy, setDriveBusy] = useState<'sync' | 'backup' | 'restore' | 'connect' | null>(null)
  const [driveNotice, setDriveNotice] = useState<Notice>(null)

  const [stickyAuto, setStickyAutoState] = useState(isAutoStickyOn)
  const canDetach = useRef(supportsDetachedWindow()).current
  const alwaysOnTop = useRef(supportsAlwaysOnTop()).current

  const [bytes, setBytes] = useState(0)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  useEffect(() => setBytes(storageBytes()), [data])

  /* ---------- AI ---------- */

  const saveAi = (patch: Partial<typeof ai>) => {
    const next = { ...ai, ...patch }
    setAi(next)
    setAiConfig(patch)
  }

  const runTest = async () => {
    setTesting(true)
    setAiNotice(null)
    try {
      await testConnection()
      setAiNotice({ tone: 'ok', text: t('settings.testOk') })
    } catch (err) {
      setAiNotice({
        tone: 'danger',
        text: t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      })
    } finally {
      setTesting(false)
    }
  }

  /* ---------- Google Drive ---------- */

  const doConnect = async () => {
    setDriveBusy('connect')
    setDriveNotice(null)
    try {
      await connectDrive(true)
      setDriveConnected(true)
    } catch (err) {
      setDriveNotice({
        tone: 'danger',
        text:
          err instanceof Error && err.message === 'drive-not-configured'
            ? t('settings.driveNotConfigured')
            : t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      })
    } finally {
      setDriveBusy(null)
    }
  }

  const doBackup = async () => {
    setDriveBusy('backup')
    setDriveNotice(null)
    try {
      await backupToDrive(data)
      setLastSync(driveLastSync())
      setDriveNotice({ tone: 'ok', text: t('settings.driveBackupOk') })
    } catch (err) {
      setDriveNotice({
        tone: 'danger',
        text: t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      })
    } finally {
      setDriveBusy(null)
    }
  }

  /* Sinkron dua-arah: gabungkan data perangkat ini dengan backup Drive. */
  const doSync = async () => {
    setDriveBusy('sync')
    setDriveNotice(null)
    try {
      await syncNow()
      setLastSync(driveLastSync())
      setDriveNotice({ tone: 'ok', text: t('settings.driveSyncOk') })
    } catch (err) {
      setDriveNotice({
        tone: 'danger',
        text: t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      })
    } finally {
      setDriveBusy(null)
    }
  }

  const doRestore = async () => {
    setDriveBusy('restore')
    setDriveNotice(null)
    try {
      const restored = await restoreFromDrive()
      if (!restored) {
        setDriveNotice({ tone: 'danger', text: t('settings.driveNoBackup') })
      } else {
        replaceAll(restored)
        setLastSync(driveLastSync())
        setDriveNotice({ tone: 'ok', text: t('settings.driveRestoreOk') })
      }
    } catch (err) {
      setDriveNotice({
        tone: 'danger',
        text: t('settings.testFail', { msg: err instanceof Error ? err.message : 'unknown' }),
      })
    } finally {
      setDriveBusy(null)
    }
  }

  /* ---------- data lokal ---------- */

  const exportJson = () => {
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `notes-backup-${new Date().toISOString().slice(0, 10)}.json`,
    )
  }

  const importJson = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!window.confirm(t('settings.importJsonConfirm'))) return
    try {
      replaceAll(JSON.parse(await file.text()) as AppData)
    } catch {
      setDriveNotice({ tone: 'danger', text: t('standards.importFailed') })
    } finally {
      if (jsonRef.current) jsonRef.current.value = ''
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} />

      <div className="stack-fade space-y-4">
        {/* ---------- TAMPILAN ---------- */}
        <GlassCard>
          <SectionTitle icon={<GearIcon className="h-[18px] w-[18px]" />} title={t('settings.appearance')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.theme')} group>
              <Segmented<ThemeChoice>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') },
                  { value: 'system', label: t('settings.themeSystem') },
                ]}
              />
            </Field>
            <Field label={t('settings.language')} group>
              <Segmented<Lang>
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'id', label: 'Bahasa Indonesia' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2 text-ink-faint">
            <SunIcon className="h-4 w-4" />
            <MoonIcon className="h-4 w-4" />
            <MonitorIcon className="h-4 w-4" />
            <GlobeIcon className="ml-auto h-4 w-4" />
          </div>

          {/* Catatan pin -> jendela sticky note sendiri (tetap terlihat walau
              browser di-minimize). */}
          <div className="mt-4 border-t border-glass-border/40 pt-4">
            <label
              className={
                canDetach
                  ? 'flex cursor-pointer items-center gap-3 rounded-2xl bg-glass-bg/15 px-3.5 py-3'
                  : 'flex items-center gap-3 rounded-2xl bg-glass-bg/15 px-3.5 py-3 opacity-60'
              }
            >
              <input
                type="checkbox"
                disabled={!canDetach}
                checked={stickyAuto && canDetach}
                onChange={(e) => {
                  setAutoSticky(e.target.checked)
                  setStickyAutoState(e.target.checked)
                }}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              <span className="flex-1 text-[13.5px] font-semibold text-ink">{t('settings.stickyAuto')}</span>
            </label>
            <p className="mt-2 text-[12px] text-ink-faint">
              {!canDetach
                ? t('settings.stickyUnsupported')
                : alwaysOnTop
                  ? t('settings.stickyHint')
                  : t('settings.stickyHintFallback')}
            </p>
          </div>
        </GlassCard>

        {/* ---------- AI ---------- */}
        <GlassCard>
          <SectionTitle icon={<SparkIcon className="h-[18px] w-[18px]" />} title={t('settings.ai')} />
          <div className="space-y-4">
            <Field label={t('settings.aiKey')} hint={t('settings.aiKeyHint')}>
              <GlassInput
                type="password"
                value={ai.apiKey}
                onChange={(e) => saveAi({ apiKey: e.target.value })}
                placeholder={t('settings.aiKeyPlaceholder')}
                autoComplete="off"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('settings.aiModel')}>
                <GlassInput
                  value={ai.model}
                  onChange={(e) => saveAi({ model: e.target.value })}
                  placeholder={AI_DEFAULTS.model}
                />
              </Field>
              <Field label={t('settings.aiBaseUrl')}>
                <GlassInput
                  value={ai.baseUrl}
                  onChange={(e) => saveAi({ baseUrl: e.target.value })}
                  // Rapikan saat selesai mengetik supaya user melihat URL yang
                  // benar-benar dipanggil (mis. "/v1" yang otomatis ditambahkan).
                  onBlur={(e) => saveAi({ baseUrl: normalizeBaseUrl(e.target.value) })}
                  placeholder={AI_DEFAULTS.baseUrl}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GlassButton variant="glass" onClick={runTest} loading={testing} disabled={!ai.apiKey.trim()}>
                {testing ? t('settings.testing') : t('settings.testAi')}
              </GlassButton>
              {aiNotice && (
                <span className={aiNotice.tone === 'ok' ? 'text-[13px] font-semibold text-ok' : 'text-[13px] font-semibold text-danger'}>
                  {aiNotice.text}
                </span>
              )}
            </div>
          </div>
        </GlassCard>

        {/* ---------- GOOGLE DRIVE ---------- */}
        <GlassCard>
          <SectionTitle
            icon={<CloudIcon className="h-[18px] w-[18px]" />}
            title={t('settings.drive')}
            badge={
              <Badge tone={driveConnected ? 'ok' : 'neutral'}>
                {driveConnected ? t('settings.driveConnected') : t('settings.driveNotConnected')}
              </Badge>
            }
          />
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-faint">{t('settings.driveHint')}</p>

          {!isDriveConfigured() ? (
            <p className="rounded-2xl border border-warn/25 bg-warn/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
              {t('settings.driveNotConfigured')}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {!driveConnected ? (
                  <GlassButton
                    variant="primary"
                    onClick={doConnect}
                    loading={driveBusy === 'connect'}
                    icon={driveBusy !== 'connect' && <CloudIcon className="h-4 w-4" />}
                  >
                    {t('settings.driveConnect')}
                  </GlassButton>
                ) : (
                  <>
                    <GlassButton
                      variant="primary"
                      onClick={doSync}
                      loading={driveBusy === 'sync' || syncing}
                      icon={driveBusy !== 'sync' && !syncing && <RefreshIcon className="h-4 w-4" />}
                    >
                      {driveBusy === 'sync' || syncing ? t('settings.driveSyncing') : t('settings.driveSync')}
                    </GlassButton>
                    <GlassButton
                      variant="glass"
                      onClick={doBackup}
                      loading={driveBusy === 'backup'}
                      icon={driveBusy !== 'backup' && <UploadIcon className="h-4 w-4" />}
                    >
                      {driveBusy === 'backup' ? t('settings.driveBackingUp') : t('settings.driveBackup')}
                    </GlassButton>
                    <GlassButton
                      variant="glass"
                      onClick={() => setConfirmRestore(true)}
                      loading={driveBusy === 'restore'}
                      icon={driveBusy !== 'restore' && <DownloadIcon className="h-4 w-4" />}
                    >
                      {driveBusy === 'restore' ? t('settings.driveRestoring') : t('settings.driveRestore')}
                    </GlassButton>
                    <GlassButton
                      variant="ghost"
                      onClick={async () => {
                        await disconnectDrive()
                        setDriveConnected(false)
                      }}
                    >
                      {t('settings.driveDisconnect')}
                    </GlassButton>
                  </>
                )}
              </div>

              {driveConnected && (
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-glass-bg/15 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => {
                      setAutoSync(e.target.checked)
                      setAutoSyncState(e.target.checked)
                    }}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="flex-1 text-[13.5px] font-semibold text-ink">{t('settings.driveAutoSync')}</span>
                </label>
              )}

              <p className="text-[12px] text-ink-faint">
                {t('settings.driveLastSync')}: {lastSync ? formatDateTime(lastSync, lang) : t('settings.driveNever')}
              </p>

              {syncError && !driveNotice && (
                <p className="text-[13px] font-semibold text-danger">
                  {t('settings.testFail', { msg: syncError })}
                </p>
              )}

              {driveNotice && (
                <p className={driveNotice.tone === 'ok' ? 'text-[13px] font-semibold text-ok' : 'text-[13px] font-semibold text-danger'}>
                  {driveNotice.text}
                </p>
              )}
            </div>
          )}
        </GlassCard>

        {/* ---------- DATA ---------- */}
        <GlassCard>
          <SectionTitle icon={<DownloadIcon className="h-[18px] w-[18px]" />} title={t('settings.data')} />
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-faint">{t('settings.dataHint')}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={(e) => void importJson(e.target.files)} />
            <GlassButton variant="glass" onClick={exportJson} icon={<DownloadIcon className="h-4 w-4" />}>
              {t('settings.exportJson')}
            </GlassButton>
            <GlassButton variant="glass" onClick={() => jsonRef.current?.click()} icon={<UploadIcon className="h-4 w-4" />}>
              {t('settings.importJson')}
            </GlassButton>
            <GlassButton variant="ghost" className="text-danger" onClick={() => setConfirmReset(true)} icon={<TrashIcon className="h-4 w-4" />}>
              {t('settings.resetAll')}
            </GlassButton>
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">
            {t('settings.storageUsed')}: {formatBytes(bytes)}
          </p>
        </GlassCard>

        {/* ---------- AKUN ---------- */}
        {account && (
          <GlassCard>
            <SectionTitle icon={<LogoutIcon className="h-[18px] w-[18px]" />} title={t('settings.account')} />
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-ink">{account.name}</p>
                <p className="truncate text-[12.5px] text-ink-faint">
                  {account.email || t('auth.localAccount')}
                </p>
              </div>
              <GlassButton variant="ghost" onClick={() => void signOut()} icon={<LogoutIcon className="h-4 w-4" />}>
                {t('auth.signOut')}
              </GlassButton>
            </div>
          </GlassCard>
        )}

        <p className="pb-2 text-center text-[11.5px] text-ink-faint">
          {t('app.name')} · {t('settings.version')} 1.0.0
        </p>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll()
          clearAppStorage()
          window.location.reload()
        }}
        title={t('settings.resetAll')}
        message={t('settings.resetConfirm')}
      />

      <ConfirmDialog
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={() => void doRestore()}
        title={t('settings.driveRestore')}
        message={t('settings.driveRestoreConfirm')}
        confirmLabel={t('settings.driveRestore')}
        tone="primary"
      />
    </>
  )
}

function SectionTitle({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-ink-soft">{icon}</span>
      <h2 className="flex-1 text-[16px] font-bold text-ink">{title}</h2>
      {badge}
    </div>
  )
}
