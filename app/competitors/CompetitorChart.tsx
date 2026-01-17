'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { TooltipProps } from 'recharts'

interface ChartData {
  name: string
  ourPrice: number
  theirPrice: number
  competitor: string
}

interface CompetitorChartProps {
  data: ChartData[]
}

type PriceTooltipProps = TooltipProps<number, string>

const CustomTooltip = ({ active, payload, label }: PriceTooltipProps) => {
  if (active && payload && payload.length >= 2 && typeof payload[0].value === 'number' && typeof payload[1].value === 'number') {
    const ourPrice = payload[0].value
    const competitorPrice = payload[1].value
    const diff = ourPrice - competitorPrice
    const savings = diff < 0 ? Math.abs(diff) : 0
    const percentDiff = competitorPrice > 0 ? (diff / competitorPrice) * 100 : 0
    
    return (
      <div className="rounded-lg border bg-white p-3 shadow-lg">
        <p className="text-sm font-medium mb-2">{label}</p>
        <p className="text-sm">
          <span className="text-brand-primary">Our Price:</span>{' '}
          ${payload[0].value.toFixed(2)}
        </p>
        <p className="text-sm">
          <span className="text-gray-600">Their Price:</span>{' '}
          ${payload[1].value.toFixed(2)}
        </p>
        {savings > 0 && (
          <p className="text-sm font-medium text-green-600 mt-1">
            Customer saves: ${savings.toFixed(2)} ({Math.abs(percentDiff).toFixed(0)}%)
          </p>
        )}
        {diff > 0 && (
          <p className="text-sm font-medium text-red-600 mt-1">
            We&apos;re higher by: ${diff.toFixed(2)} ({percentDiff.toFixed(0)}%)
          </p>
        )}
        {diff === 0 && (
          <p className="text-sm font-medium text-gray-600 mt-1">
            Same price
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function CompetitorChart({ data }: CompetitorChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={100}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar 
          dataKey="ourPrice" 
          fill="#213cef" 
          name="Our Price" 
          radius={[8, 8, 0, 0]}
        />
        <Bar 
          dataKey="theirPrice" 
          fill="#94a3b8" 
          name="Competitor Price" 
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
