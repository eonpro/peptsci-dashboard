'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'

// Recharts needs concrete color values; keep the brand palette in one place.
const BRAND_PRIMARY = '#213cef'
const REVENUE_STROKE = '#818cf8'

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
      <div className="flex h-72 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
        <p className="text-sm font-medium text-slate-600">No activity yet</p>
        <p className="text-xs text-slate-400">
          Revenue and commission trends appear here once transactions come in.
        </p>
      </div>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="trendRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={REVENUE_STROKE} stopOpacity={0.25} />
              <stop offset="100%" stopColor={REVENUE_STROKE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={usd}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip
            formatter={(value: number | string) => usd(Number(value))}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              fontSize: 12,
            }}
            cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Area
            dataKey="revenue"
            name="Revenue"
            type="monotone"
            stroke={REVENUE_STROKE}
            strokeWidth={2}
            fill="url(#trendRevenueFill)"
          />
          <Line
            dataKey="commission"
            name="Commission"
            type="monotone"
            stroke={BRAND_PRIMARY}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
