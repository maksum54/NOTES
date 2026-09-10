import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cx } from '@/lib/utils'
import { useLang } from '@/context/LangContext'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { GlassButton } from '@/components/glass/Glass'
import {
  BellIcon, BookIcon, CloudIcon, FolderIcon, GearIcon, GlobeIcon, HomeIcon,
  MoonIcon, MonitorIcon, OfflineIcon, PenIcon, SparkIcon, SunIcon, TaskIcon,
} from '@/components/icons'
import { InstallPrompt } from './InstallPrompt'

interface NavItem {
  to: string
  labelKey: string
  icon: (p: { className?: string }) => ReactNode
  badge?: number
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, toggle: toggleLang } = useLang()
  const { theme, setTheme } = useTheme()
  const { account } = useAuth()
  const { data, unreadWarnings } = useData()

  // Badge jumlah task yang belum selesai di seluruh project.
  const openTaskCount = useMemo(
    () =>
      data.projects.reduce(
        (n, p) =>
          n + p.buildings.reduce((m, b) => m + b.tasks.filter((t) => t.status === 'belum').length, 0),
        0,
      ),
    [data.projects],
  )
  const location = useLocation()
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Selalu kembali ke atas saat pindah halaman.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  const items: NavItem[] = [
    { to: '/', labelKey: 'nav.dashboard', icon: HomeIcon },
    { to: '/projects', labelKey: 'nav.projects', icon: FolderIcon },
    { to: '/tasks', labelKey: 'nav.tasks', icon: TaskIcon, badge: openTaskCount },
    { to: '/boards', labelKey: 'nav.boards', icon: PenIcon },
    { to: '/standards', labelKey: 'nav.standards', icon: BookIcon },
    { to: '/warnings', labelKey: 'nav.warnings', icon: BellIcon, badge: unreadWarnings },
    { to: '/assistant', labelKey: 'nav.assistant', icon: SparkIcon },
    { to: '/storage', labelKey: 'nav.storage', icon: CloudIcon },
    { to: '/settings', labelKey: 'nav.settings', icon: GearIcon },
  ]

  const ThemeIcon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : MonitorIcon
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* --- Sidebar (desktop) --- */}
      <aside className="hidden w-[248px] shrink-0 p-4 lg:block">
        <div className="glass glass-sheen sticky top-4 flex h-[calc(100dvh-2rem)] flex-col rounded-glass p-3">
          <div className="flex items-center gap-3 px-2 py-3">
            <Logo />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-tight text-ink">{t('app.name')}</p>
              <p className="truncate text-[11px] text-ink-faint">{t('app.tagline')}</p>
            </div>
          </div>

          <nav className="mt-2 flex flex-1 flex-col gap-1">
            {items.map((item) => (
              <SideLink key={item.to} item={item} label={t(item.labelKey)} />
            ))}
          </nav>

          <div className="mt-3 space-y-2 border-t hairline pt-3">
            <div className="flex gap-2">
              <GlassButton
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setTheme(nextTheme)}
                title={t('settings.theme')}
                icon={<ThemeIcon className="h-4 w-4" />}
              >
                {theme === 'dark'
                  ? t('settings.themeDark')
                  : theme === 'light'
                    ? t('settings.themeLight')
                    : t('settings.themeSystem')}
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={toggleLang}
                title={t('settings.language')}
                icon={<GlobeIcon className="h-4 w-4" />}
              >
                {lang.toUpperCase()}
              </GlassButton>
            </div>
            {account && (
              <div className="flex items-center gap-2.5 rounded-2xl px-2 py-2">
                <Avatar account={account} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{account.name}</p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {account.email || t('auth.localAccount')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* --- Header (mobile) --- */}
      <header className="sticky top-0 z-40 px-3 pt-3 safe-top lg:hidden">
        <div className="glass glass-sheen flex items-center gap-2 rounded-glass px-3 py-2.5">
          <Logo small />
          <p className="flex-1 truncate text-[15px] font-extrabold tracking-tight text-ink">
            {t('app.name')}
          </p>
          {!online && <OfflineIcon className="h-4 w-4 text-warn" />}
          <GlassButton variant="ghost" size="icon" onClick={toggleLang} aria-label={t('settings.language')}>
            <span className="text-[11px] font-extrabold">{lang.toUpperCase()}</span>
          </GlassButton>
          <GlassButton
            variant="ghost"
            size="icon"
            onClick={() => setTheme(nextTheme)}
            aria-label={t('settings.theme')}
          >
            <ThemeIcon className="h-[18px] w-[18px]" />
          </GlassButton>
        </div>
      </header>

      {/* --- Konten --- */}
      <main className="min-w-0 flex-1 px-3 pb-28 pt-3 sm:px-5 lg:py-4 lg:pb-8 lg:pr-5 lg:pl-0">
        {!online && (
          <div className="glass mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[13px] text-warn">
            <OfflineIcon className="h-4 w-4 shrink-0" />
            {t('app.offline')}
          </div>
        )}
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* --- Tab bar (mobile) --- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-bottom lg:hidden">
        <div className="glass-strong glass-sheen flex items-center gap-0.5 rounded-glass p-1.5">
          {items.map((item) => (
            <TabLink key={item.to} item={item} label={t(item.labelKey)} />
          ))}
        </div>
      </nav>

      <InstallPrompt />
    </div>
  )
}

function SideLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] font-semibold transition-all',
          isActive
            ? 'bg-glass-bg/25 text-ink shadow-[inset_0_1px_0_0_rgb(var(--glass-highlight)/0.35)]'
            : 'text-ink-soft hover:bg-glass-bg/15 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-pill bg-accent" />
          )}
          <Icon className="h-[19px] w-[19px] shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          {!!item.badge && item.badge > 0 && (
            <span className="rounded-pill bg-danger px-1.5 py-0.5 text-[10px] font-extrabold text-white">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function TabLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cx(
          'relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-all',
          isActive ? 'bg-glass-bg/30 text-accent' : 'text-ink-faint active:scale-95',
        )
      }
    >
      <span className="relative">
        <Icon className="h-[21px] w-[21px]" />
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -right-1.5 -top-1 min-w-[15px] rounded-pill bg-danger px-1 text-center text-[9px] font-extrabold leading-[15px] text-white">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[9.5px] font-bold leading-none">{label}</span>
    </NavLink>
  )
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div
      className={cx(
        'grid shrink-0 place-items-center rounded-2xl',
        'bg-gradient-to-br from-accent to-accent-soft',
        'shadow-[0_6px_18px_-6px_rgb(var(--accent)/0.8)]',
        small ? 'h-8 w-8' : 'h-10 w-10',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={small ? 'h-4 w-4' : 'h-5 w-5'}
        fill="none"
        stroke="white"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12Z" />
      </svg>
    </div>
  )
}

function Avatar({ account }: { account: { name: string; picture: string } }) {
  if (account.picture) {
    return (
      <img
        src={account.picture}
        alt=""
        referrerPolicy="no-referrer"
        className="h-8 w-8 shrink-0 rounded-pill object-cover ring-1 ring-glass-border/40"
      />
    )
  }
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-accent/20 text-[12px] font-extrabold text-accent ring-1 ring-accent/25">
      {account.name.slice(0, 2).toUpperCase()}
    </div>
  )
}
