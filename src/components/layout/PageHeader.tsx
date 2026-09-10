import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassButton } from '@/components/glass/Glass'
import { ChevronLeft } from '@/components/icons'
import { useLang } from '@/context/LangContext'

export function PageHeader({
  title,
  subtitle,
  action,
  back,
  crumbs,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  back?: string | true
  crumbs?: { label: string; to?: string }[]
}) {
  const navigate = useNavigate()
  const { t } = useLang()

  return (
    <div className="mb-5 animate-fade-up">
      {back && (
        <GlassButton
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          icon={<ChevronLeft className="h-4 w-4" />}
        >
          {t('common.back')}
        </GlassButton>
      )}
      {crumbs && crumbs.length > 0 && (
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-faint">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.to ? (
                <button
                  type="button"
                  onClick={() => navigate(c.to as string)}
                  className="truncate font-semibold transition-colors hover:text-ink"
                >
                  {c.label}
                </button>
              ) : (
                <span className="truncate">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[30px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-faint">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}
