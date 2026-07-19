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
  type: 'line' | 'bar' | 'pie' | 'sparkline'
  data: Array<Record<string, string | number>>
  dataKey?: string
  xKey?: string
  height?: number
}

const CHART_COLORS = [
  '#213cef', // PEPTSCI brand blue
  '#5B6EF7', // Lighter brand blue
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#fb7185', // rose-400
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
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
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
    <div className="rounded-2xl border border-white/10 bg-brand-onyx/95 px-4 py-3 text-white shadow-xl backdrop-blur-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
        {typeof label === 'string' ? formatAxisLabel(label) : label}
      </p>
      <p className="mt-1 text-lg font-semibold text-white">{currencyFormatter.format(value)}</p>
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
  // Dark theme tick color
  const tickColor = 'rgba(148, 163, 184, 0.8)' // slate-400 with opacity

  // Axis-free area chart for embedding inside hero/stat cards.
  if (type === 'sparkline') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b9dff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#8b9dff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey={xKey} hide />
          <YAxis hide />
          <Tooltip
            content={<ModernTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="#aab8ff"
            strokeWidth={2.5}
            fill="url(#sparklineGradient)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#ffffff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'line') {
    const lastPoint = data.length ? data[data.length - 1] : null

    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="lineAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#213cef" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#213cef" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="lineStrokeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#213cef" />
              <stop offset="100%" stopColor="#5B6EF7" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            tick={{ fontSize: 12, fill: tickColor }}
            tickFormatter={(value) => formatAxisLabel(value as string)}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={70}
            tickMargin={12}
            tick={{ fontSize: 11, fill: tickColor }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Tooltip
            content={<ModernTooltip />}
            cursor={{ stroke: 'rgba(33, 60, 239, 0.3)', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke="url(#lineStrokeGradient)"
            strokeWidth={3}
            fill="url(#lineAreaGradient)"
            dot={{ r: 0 }}
            activeDot={{ r: 6, strokeWidth: 0, fill: '#213cef' }}
          />
          {lastPoint && (
            <ReferenceDot
              x={lastPoint[xKey] as string | number}
              y={lastPoint[dataKey] as number}
              r={5}
              fill="#213cef"
              stroke="#050722"
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
              <stop offset="0%" stopColor="#213cef" stopOpacity={1} />
              <stop offset="100%" stopColor="#5B6EF7" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            angle={-45}
            height={90}
            textAnchor="end"
            tickMargin={16}
            tick={{ fontSize: 11, fill: tickColor }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={60}
            tickMargin={12}
            tick={{ fontSize: 11, fill: tickColor }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
          />
          <Tooltip content={<ModernTooltip />} cursor={{ fill: 'rgba(33, 60, 239, 0.15)' }} />
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
                  <stop offset="0%" stopColor="rgba(33, 60, 239, 0.25)" />
                  <stop offset="45%" stopColor="rgba(33, 60, 239, 0.08)" />
                  <stop offset="100%" stopColor="rgba(33, 60, 239, 0)" />
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
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    stroke="rgba(5,7,34,0.9)"
                    strokeWidth={2}
                  />
                ))}
                <Label
                  position="center"
                  content={({ viewBox }) => {
                    if (
                      !viewBox ||
                      !('cx' in viewBox) ||
                      typeof viewBox.cx !== 'number' ||
                      typeof viewBox.cy !== 'number'
                    )
                      return null
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
                          className="fill-white text-lg font-semibold"
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

        <div className="grid w-full gap-3 rounded-2xl border border-white/10 bg-[#0a0e3a]/50 p-4 shadow-xl backdrop-blur-md lg:max-w-[280px]">
          {data.map((item, index) => {
            const value = Number(item[pieDataKey] ?? 0)
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0
            return (
              <div
                key={`${String(item[xKey ?? 'name'] ?? 'segment')}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-brand-onyx/70 px-3 py-2.5 shadow-xs transition-colors duration-200 hover:border-brand-primary/40 hover:bg-[#0a0e3a]/70"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {String(item[xKey ?? 'name'] ?? 'Unknown')}
                  </p>
                  <p className="text-sm font-semibold text-white">
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
