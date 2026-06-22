'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Localized fallback so a single chart failing to render (e.g. malformed data)
// degrades gracefully to a message instead of crashing the whole page segment.
const chartFallback = (
  <div className="flex h-[320px] w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400 dark:border-white/10 dark:text-white/40">
    Chart unavailable
  </div>
)

interface ChartCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  loading?: boolean
}

export function ChartCard({ title, description, children, className, loading }: ChartCardProps) {
  const containerClasses =
    'group relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0px_26px_68px_-35px_rgba(33,60,239,0.35)] transition-transform duration-500 hover:-translate-y-1 hover:shadow-[0px_24px_70px_-30px_rgba(33,60,239,0.45)] backdrop-blur-[14px] dark:border-white/10 dark:bg-[#0a0e3a]/60 dark:shadow-none dark:hover:shadow-lg dark:hover:shadow-[#213cef]/15'

  const headerClasses = 'relative z-10 flex flex-col gap-1 pb-0 md:pb-1'

  const titleClasses =
    'text-lg font-semibold tracking-tight text-slate-900 dark:text-white md:text-xl'

  const descriptionClasses = 'text-sm text-slate-500 dark:text-slate-400'

  if (loading) {
    return (
      <Card className={cn(containerClasses, className)}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(33,60,239,0.28),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(33,60,239,0.14),_transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/80 via-white/30 to-white/5 dark:from-[#0a0e3a]/70 dark:via-[#050722]/20" />
        <CardHeader className={headerClasses}>
          <CardTitle className={titleClasses}>{title}</CardTitle>
          {description && (
            <CardDescription className={descriptionClasses}>{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="relative z-10 pt-8">
          <div className="h-[320px] w-full animate-pulse rounded-2xl bg-gradient-to-br from-slate-100 via-white to-slate-50 dark:from-white/5 dark:via-white/5 dark:to-white/5" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(containerClasses, className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(33,60,239,0.22),_transparent_60%)] opacity-90 transition-opacity duration-500 group-hover:opacity-100 dark:bg-[radial-gradient(circle_at_top_left,_rgba(33,60,239,0.15),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/90 via-white/40 to-white/10 dark:from-[#0a0e3a]/70 dark:via-[#050722]/30" />

      <CardHeader className={headerClasses}>
        <CardTitle className={titleClasses}>{title}</CardTitle>
        {description && (
          <CardDescription className={descriptionClasses}>{description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="relative z-10 mt-6 pt-0">
        <ErrorBoundary fallback={chartFallback}>{children}</ErrorBoundary>
      </CardContent>
    </Card>
  )
}
