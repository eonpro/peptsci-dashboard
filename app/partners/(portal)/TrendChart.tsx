'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'

// Recharts needs concrete color values; keep the brand palette in one place.
const BRAND_PRIMARY = '#213cef'
const BRAND_PRIMARY_SOFT = '#c7d2fe'

const usd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function TrendChart({
  data,
}: {
  data: Array<{ month: string; revenue: number; commission: number }>
}) {
  const hasData = data.some((p) => p.revenue !== 0 || p.commission !== 0)

  if (!hasData) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No activity yet — revenue and commission trends appear here once transactions come in.
        </p>
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip formatter={(value: number | string) => usd(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name="Revenue" fill={BRAND_PRIMARY_SOFT} radius={[4, 4, 0, 0]} />
          <Line dataKey="commission" name="Commission" stroke={BRAND_PRIMARY} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
