import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

const TONES = {
  default: { value: 'text-slate-900', iconWrap: 'bg-brand-primary/10 text-brand-primary' },
  amber: { value: 'text-amber-600', iconWrap: 'bg-amber-500/10 text-amber-600' },
  emerald: { value: 'text-emerald-600', iconWrap: 'bg-emerald-500/10 text-emerald-600' },
} as const

/** KPI card: label, big value, optional icon chip and sub-label. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  sub,
  className,
}: {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone?: keyof typeof TONES
  sub?: React.ReactNode
  className?: string
}) {
  const t = TONES[tone]
  return (
    <Card className={cn('flex items-start justify-between gap-3 p-5', className)}>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn('mt-1.5 truncate text-2xl font-bold tracking-tight', t.value)}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </div>
      {Icon && (
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', t.iconWrap)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      )}
    </Card>
  )
}
