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
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
        </CardHeader>
        <CardContent>
          <div className="h-7 w-24 bg-gray-200 animate-pulse rounded" />
          {description && <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mt-1" />}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border-gray-100 bg-gradient-to-br from-white to-gray-50/30 overflow-hidden group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</CardTitle>
        {icon && (
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-300">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{value}</div>
        {(description || change !== undefined) && (
          <div className="flex items-center gap-2 mt-2">
            {change !== undefined && (
              <span
                className={cn(
                  'flex items-center text-xs font-semibold px-2 py-1 rounded-full',
                  isPositive && 'bg-emerald-100 text-emerald-700',
                  isNegative && 'bg-rose-100 text-rose-700',
                  !isPositive && !isNegative && 'bg-gray-100 text-gray-600'
                )}
              >
                {isPositive && <ArrowUpIcon className="h-3 w-3 mr-0.5" />}
                {isNegative && <ArrowDownIcon className="h-3 w-3 mr-0.5" />}
                {Math.abs(change)}%
                {changeLabel && <span className="ml-1">{changeLabel}</span>}
              </span>
            )}
            {description && (
              <p className="text-xs text-gray-500 font-medium">{description}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
