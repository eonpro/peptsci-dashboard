'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Label,
} from 'recharts'
import type { TooltipProps } from 'recharts'

interface ChartProps {
  type: 'line' | 'bar' | 'pie'
  data: Array<Record<string, string | number>>
  dataKey?: string
  xKey?: string
  height?: number
}

const CHART_COLORS = [
  '#5B4BFF',
  '#7B5CFF',
  '#EE5D8F',
  '#2AC7C9',
  '#F4A83A',
  '#3BA0F2',
  '#6EE7B7',
  '#F97373',
]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const formatCompactCurrency = (value: number) =>
  compactCurrencyFormatter.format(value).replace('.0', '')

const formatAxisLabel = (value: string | number): string => {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${monthNames[parseInt(month, 10) - 1]} ${year}`
  }
  if (typeof value === 'string' && value.includes('-')) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }
  return String(value)
}

const ModernTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload || payload.length === 0) return null
  const valueRaw = payload[0]?.value ?? 0
  const value = typeof valueRaw === 'number' ? valueRaw : Number(valueRaw)

  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-slate-900 shadow-[0px_24px_45px_-28px_rgba(82,96,255,0.45)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-50">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {typeof label === 'string' ? formatAxisLabel(label) : label}
      </p>
      <p className="mt-1 text-lg font-semibold">{currencyFormatter.format(value)}</p>
    </div>
  )
}

export default function DashboardCharts({
  type,
  data,
  dataKey = 'value',
  xKey = 'name',
  height = 320,
}: ChartProps) {
  if (type === 'line') {
    const lastPoint = data.length ? data[data.length - 1] : null

    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="lineAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7065FF" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#7065FF" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="lineStrokeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5B4BFF" />
              <stop offset="100%" stopColor="#8A6BFF" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            tick={{ fontSize: 12, fill: 'rgba(100,116,139,0.9)' }}
            tickFormatter={(value) => formatAxisLabel(value as string)}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={70}
            tickMargin={12}
            tick={{ fontSize: 11, fill: 'rgba(100,116,139,0.9)' }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Tooltip content={<ModernTooltip />} cursor={{ stroke: 'rgba(99,102,241,0.15)', strokeWidth: 2 }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="url(#lineStrokeGradient)"
            strokeWidth={3}
            fill="url(#lineAreaGradient)"
            dot={{ r: 0 }}
            activeDot={{ r: 6, strokeWidth: 0, fill: '#5B4BFF' }}
          />
          {lastPoint && (
            <ReferenceDot
              x={lastPoint[xKey] as string | number}
              y={lastPoint[dataKey] as number}
              r={5}
              fill="#5B4BFF"
              stroke="white"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5B4BFF" stopOpacity={1} />
              <stop offset="100%" stopColor="#8A6BFF" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            angle={-45}
            height={90}
            textAnchor="end"
            tickMargin={16}
            tick={{ fontSize: 11, fill: 'rgba(100,116,139,0.9)' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={60}
            tickMargin={12}
            tick={{ fontSize: 11, fill: 'rgba(100,116,139,0.9)' }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Tooltip content={<ModernTooltip />} cursor={{ fill: 'rgba(91, 75, 255, 0.06)' }} />
          <Bar
            dataKey={dataKey}
            fill="url(#barGradient)"
            radius={[12, 12, 12, 12]}
            maxBarSize={42}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }
  if (type === 'pie') {
    const pieDataKey = dataKey ?? 'value'
    const total = data.reduce((sum, item) => sum + Number(item[pieDataKey] ?? 0), 0)

    return (
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <defs>
                <radialGradient id="donutShadow" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="rgba(91, 75, 255, 0.25)" />
                  <stop offset="45%" stopColor="rgba(91, 75, 255, 0.08)" />
                  <stop offset="100%" stopColor="rgba(91, 75, 255, 0)" />
                </radialGradient>
              </defs>
              <Pie
                data={data}
                dataKey={pieDataKey}
                cx="50%"
                cy="50%"
                startAngle={90}
                endAngle={-270}
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                cornerRadius={12}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="rgba(255,255,255,0.85)" strokeWidth={2} />
                ))}
                <Label
                  position="center"
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox) || typeof viewBox.cx !== 'number' || typeof viewBox.cy !== 'number') return null
                    const { cx, cy } = viewBox
                    return (
                      <g>
                        <text
                          x={cx}
                          y={cy - 6}
                          textAnchor="middle"
                          className="fill-slate-400 text-xs uppercase tracking-[0.18em]"
                        >
                          TOTAL
                        </text>
                        <text
                          x={cx}
                          y={cy + 14}
                          textAnchor="middle"
                          className="fill-slate-900 text-lg font-semibold"
                        >
                          {currencyFormatter.format(total)}
                        </text>
                      </g>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid w-full gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0px_20px_45px_-28px_rgba(82,96,255,0.38)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 lg:max-w-[280px]">
          {data.map((item, index) => {
            const value = Number(item[pieDataKey] ?? 0)
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0
            return (
              <div
                key={`${String(item[xKey ?? 'name'] ?? 'segment')}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/80 px-3 py-2.5 shadow-sm transition-colors duration-200 hover:border-indigo-100 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {String(item[xKey ?? 'name'] ?? 'Unknown')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {percentage}% · {currencyFormatter.format(value)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return null
}
