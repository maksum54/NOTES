import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useLang } from '@/context/LangContext'
import { Badge, EmptyState, GlassButton, GlassCard } from '@/components/glass/Glass'
import { PageHeader } from '@/components/layout/PageHeader'
import { AlertIcon, BellIcon, CheckIcon, ChevronRight, TrashIcon } from '@/components/icons'
import { formatDateTime } from '@/lib/utils'
import { notificationSupport, requestNotificationPermission, type PermissionState } from '@/lib/notify'

/** WARNING DI HANDPHONE OR PC. */
export function WarningsPage() {
  const { t, lang } = useLang()
  const { data, markWarningRead, markAllWarningsRead, clearWarnings, unreadWarnings } = useData()
  const [permission, setPermission] = useState<PermissionState>('default')

  useEffect(() => {
    setPermission(notificationSupport())
  }, [])

  const enable = async () => {
    setPermission(await requestNotificationPermission())
  }

  return (
    <>
      <PageHeader
        title={t('warnings.title')}
        subtitle={t('warnings.subtitle')}
        action={
          data.warnings.length > 0 && (
            <>
              <GlassButton variant="glass" size="sm" onClick={markAllWarningsRead} icon={<CheckIcon className="h-4 w-4" />}>
                {t('warnings.markAllRead')}
              </GlassButton>
              <GlassButton variant="ghost" size="sm" onClick={clearWarnings} icon={<TrashIcon className="h-4 w-4" />}>
                {t('warnings.clearAll')}
              </GlassButton>
            </>
          )
        }
      />

      <div className="stack-fade space-y-4">
        {/* --- izin notifikasi --- */}
        <GlassCard>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
              <BellIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-ink">
                {permission === 'granted' ? t('warnings.pushEnabled') : t('warnings.enablePush')}
              </p>
              <p className="text-[12.5px] leading-relaxed text-ink-faint">
                {permission === 'denied' ? t('warnings.pushDenied') : t('warnings.pushHint')}
              </p>
            </div>
            {permission === 'default' && (
              <GlassButton variant="primary" size="sm" onClick={enable}>
                {t('warnings.enablePush')}
              </GlassButton>
            )}
            {permission === 'granted' && <Badge tone="ok">{t('warnings.pushEnabled')}</Badge>}
            {permission === 'denied' && <Badge tone="danger">{t('warnings.pushDenied')}</Badge>}
          </div>
        </GlassCard>

        {/* --- daftar peringatan --- */}
        {data.warnings.length === 0 ? (
          <GlassCard>
            <EmptyState icon={<CheckIcon className="h-8 w-8" />} title={t('warnings.empty')} />
          </GlassCard>
        ) : (
          <GlassCard>
            {unreadWarnings > 0 && (
              <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-accent">
                {t('warnings.unread', { n: unreadWarnings })}
              </p>
            )}
            <ul className="-mx-2 space-y-0.5">
              {data.warnings.map((w) => {
                const tone =
                  w.severity === 'critical' ? 'text-danger' : w.severity === 'warning' ? 'text-warn' : 'text-info'
                return (
                  <li key={w.id}>
                    <Link
                      to={w.href}
                      onClick={() => markWarningRead(w.id)}
                      className="flex items-start gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-glass-bg/20"
                    >
                      <AlertIcon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${tone}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[14px] font-bold text-ink">{w.title}</p>
                          <Badge
                            tone={w.severity === 'critical' ? 'danger' : w.severity === 'warning' ? 'warn' : 'info'}
                          >
                            {t(`warnings.severity.${w.severity}`)}
                          </Badge>
                          {!w.read && <span className="h-2 w-2 rounded-pill bg-accent" />}
                        </div>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{w.body}</p>
                        <p className="mt-1 text-[11px] text-ink-faint">{formatDateTime(w.createdAt, lang)}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </GlassCard>
        )}
      </div>
    </>
  )
}
