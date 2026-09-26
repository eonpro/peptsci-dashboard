'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPIProps {
  title: string
  value: string | number
  description?: string
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  loading?: boolean
}

export function KPI({ title, value, description, change, changeLabel, icon, loading }: KPIProps) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground dark:text-white/50">
            {title}
          </CardTitle>
          {icon && <div className="h-4 w-4 text-muted-foreground dark:text-white/30">{icon}</div>}
        </CardHeader>
        <CardContent>
          <div className="h-7 w-24 bg-gray-200 dark:bg-white/10 animate-pulse rounded" />
          {description && (
            <div className="h-4 w-32 bg-gray-200 dark:bg-white/10 animate-pulse rounded mt-1" />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="group overflow-hidden transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-0.5 dark:hover:border-white/20 dark:hover:shadow-glass-lift">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-gray-600 dark:text-white/60 uppercase tracking-wider">
          {title}
        </CardTitle>
        {icon && (
          <div className="h-10 w-10 rounded-xl bg-linear-to-br from-indigo-500/10 to-violet-500/10 dark:from-brand-primary/40 dark:to-brand-teal/20 dark:ring-1 dark:ring-white/10 flex items-center justify-center text-indigo-600 dark:text-white group-hover:scale-110 transition-transform duration-300">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold bg-linear-to-r from-gray-900 to-gray-700 dark:from-white dark:to-white/80 bg-clip-text text-transparent">
          {value}
        </div>
        {(description || change !== undefined) && (
          <div className="flex items-center gap-2 mt-2">
            {change !== undefined && (
              <span
                className={cn(
                  'flex items-center text-xs font-semibold px-2 py-1 rounded-full',
                  isPositive &&
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                  isNegative && 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
                  !isPositive &&
                    !isNegative &&
                    'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60'
                )}
              >
                {isPositive && <ArrowUpIcon className="h-3 w-3 mr-0.5" />}
                {isNegative && <ArrowDownIcon className="h-3 w-3 mr-0.5" />}
                {Math.abs(change)}%{changeLabel && <span className="ml-1">{changeLabel}</span>}
              </span>
            )}
            {description && (
              <p className="text-xs text-gray-500 dark:text-white/50 font-medium">{description}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
