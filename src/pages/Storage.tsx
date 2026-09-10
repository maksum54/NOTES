import { useCallback, useEffect, useRef, useState } from 'react'
import { useLang } from '@/context/LangContext'
import { useData } from '@/context/DataContext'
import { Badge, EmptyState, GlassButton, GlassCard, ProgressBar } from '@/components/glass/Glass'
import { ConfirmDialog } from '@/components/glass/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CloudIcon, DownloadIcon, FileIcon, TrashIcon, UploadIcon,
} from '@/components/icons'
import {
  connectDrive, deleteStorageFile, downloadStorageFile, driveQuota,
  isDriveConfigured, isDriveConnected, listStorageFiles, STORAGE_FOLDER_NAME,
  uploadStorageFile, type DriveQuota, type StorageFile,
} from '@/lib/drive'
import { formatBytes, formatDateTime } from '@/lib/utils'

/**
 * STORAGE PRIBADI — folder "NOTES Storage" di Google Drive user.
 * Upload & unduh file apa saja: zip, excel, dokumen, gambar, dll.
 * File benar-benar tinggal di Drive milik user, bukan di server app.
 */
export function StoragePage() {
  const { t, lang } = useLang()
  const { data } = useData()

  const [connected, setConnected] = useState(isDriveConnected)
  const [files, setFiles] = useState<StorageFile[]>([])
  const [quota, setQuota] = useState<DriveQuota | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<StorageFile | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const [list, q] = await Promise.all([listStorageFiles(), driveQuota().catch(() => null)])
      setFiles(list)
      setQuota(q)
    } catch (err) {
      if (err instanceof Error && err.message === 'drive-unauthorized') setConnected(false)
      setNotice({ tone: 'danger', text: t('storage.loadFail') })
    } finally {
      setLoading(false)
    }
  }, [t])

  // Muat daftar otomatis begitu Drive tersambung.
  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh, data.updatedAt])

  const doConnect = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await connectDrive(true)
      setConnected(true)
    } catch (err) {
      setNotice({
        tone: 'danger',
        text:
          err instanceof Error && err.message === 'drive-not-configured'
            ? t('settings.driveNotConfigured')
            : t('storage.connectFail'),
      })
    } finally {
      setBusy(false)
    }
  }

  const onPickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    setProgress(0)
    setNotice(null)
    try {
      for (const file of Array.from(list)) {
        await uploadStorageFile(file, { onProgress: setProgress })
      }
      setNotice({ tone: 'ok', text: t('storage.uploadOk') })
      await refresh()
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setNotice({ tone: 'danger', text: t('storage.uploadFail') })
      }
    } finally {
      setBusy(false)
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDownload = async (file: StorageFile) => {
    setNotice(null)
    try {
      await downloadStorageFile(file)
    } catch {
      setNotice({ tone: 'danger', text: t('storage.downloadFail') })
    }
  }

  const onDelete = async (file: StorageFile) => {
    setBusy(true)
    try {
      await deleteStorageFile(file.id)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
    } catch {
      setNotice({ tone: 'danger', text: t('storage.deleteFail') })
    } finally {
      setBusy(false)
      setPendingDelete(null)
    }
  }

  return (
    <>
      <PageHeader
        title={t('storage.title')}
        subtitle={t('storage.subtitle')}
        action={
          connected && (
            <GlassButton
              variant="primary"
              loading={busy}
              onClick={() => fileRef.current?.click()}
              icon={!busy && <UploadIcon className="h-4 w-4" />}
            >
              {t('storage.upload')}
            </GlassButton>
          )
        }
      />

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void onPickFiles(e.target.files)}
      />

      <div className="stack-fade space-y-4">
        {!isDriveConfigured() ? (
          <GlassCard>
            <p className="rounded-2xl border border-warn/25 bg-warn/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
              {t('settings.driveNotConfigured')}
            </p>
          </GlassCard>
        ) : !connected ? (
          <GlassCard className="flex min-h-[60dvh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
                <CloudIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-ink">{t('storage.notConnected')}</p>
                <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-faint">{t('storage.connectHint')}</p>
              </div>
              <GlassButton variant="primary" loading={busy} onClick={doConnect} icon={!busy && <CloudIcon className="h-4 w-4" />}>
                {t('settings.driveConnect')}
              </GlassButton>
            </div>
          </GlassCard>
        ) : (
          <>
            {/* ---------- kuota Drive ---------- */}
            {quota && (
              <GlassCard>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">{t('storage.quota')}</p>
                  <p className="text-[13px] font-semibold text-ink-faint">
                    {quota.limitBytes
                      ? `${formatBytes(quota.usedBytes)} / ${formatBytes(quota.limitBytes)}`
                      : formatBytes(quota.usedBytes)}
                  </p>
                </div>
                <ProgressBar
                  value={quota.limitBytes ? (quota.usedBytes / quota.limitBytes) * 100 : 0}
                  tone={quota.limitBytes && quota.usedBytes / quota.limitBytes > 0.9 ? 'danger' : 'accent'}
                />
                <p className="mt-3 text-[12px] text-ink-faint">
                  {t('storage.folderHint', { folder: STORAGE_FOLDER_NAME })}
                </p>
              </GlassCard>
            )}

            {/* ---------- progres upload ---------- */}
            {progress !== null && (
              <GlassCard>
                <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink-soft">{t('storage.uploading')}</p>
                <ProgressBar value={progress} tone="accent" />
              </GlassCard>
            )}

            {/* ---------- daftar file ---------- */}
            <GlassCard>
              <div className="mb-3 flex items-center gap-2">
                <FileIcon className="h-[18px] w-[18px] text-ink-soft" />
                <h2 className="flex-1 text-[15px] font-bold text-ink">{t('storage.files')}</h2>
                <Badge tone="neutral">{files.length}</Badge>
                <GlassButton variant="ghost" size="sm" loading={loading} onClick={() => void refresh()}>
                  {t('common.retry')}
                </GlassButton>
              </div>

              {notice && (
                <p className={notice.tone === 'ok' ? 'mb-3 text-[13px] font-semibold text-ok' : 'mb-3 text-[13px] font-semibold text-danger'}>
                  {notice.text}
                </p>
              )}

              {loading && files.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-faint">{t('common.loading')}</p>
              ) : files.length === 0 ? (
                <div className="flex min-h-[50dvh] items-center justify-center">
                  <EmptyState
                    icon={<CloudIcon className="h-7 w-7" />}
                    title={t('storage.empty')}
                    hint={t('storage.emptyHint')}
                  />
                </div>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {files.map((file) => (
                    <li key={file.id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-glass-bg/20">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-info/15 text-info">
                        <FileIcon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{file.name}</p>
                        <p className="truncate text-[12px] text-ink-faint">
                          {formatBytes(file.size)}
                          {file.modifiedTime && ` · ${formatDateTime(file.modifiedTime, lang)}`}
                        </p>
                      </div>
                      <GlassButton
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('common.open')}
                        onClick={() => void onDownload(file)}
                      >
                        <DownloadIcon className="h-4 w-4" />
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('common.delete')}
                        disabled={busy}
                        onClick={() => setPendingDelete(file)}
                      >
                        <TrashIcon className="h-4 w-4 hover:text-danger" />
                      </GlassButton>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void onDelete(pendingDelete)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
      />
    </>
  )
}
