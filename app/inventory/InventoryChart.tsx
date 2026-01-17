'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { TooltipProps } from 'recharts'

interface ChartData {
  name: string
  value: number
  srp: number
}

interface InventoryChartProps {
  data: ChartData[]
}

type InventoryTooltipProps = TooltipProps<number, string>

const CustomTooltip = ({ active, payload, label }: InventoryTooltipProps) => {
  if (active && payload && payload.length > 0) {
    const firstPayload = payload[0]
    if (typeof firstPayload.value !== 'number') {
      return null
    }
    return (
      <div className="rounded-lg border bg-white p-3 shadow-lg">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-gray-600">
          Quantity: {firstPayload.value.toLocaleString()} units
        </p>
        {firstPayload.payload && typeof firstPayload.payload.srp === 'number' && (
          <p className="text-sm text-gray-600">
            Value: ${(firstPayload.value * firstPayload.payload.srp).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        )}
      </div>
    )
  }
  return null
}

export default function InventoryChart({ data }: InventoryChartProps) {
  // Color based on stock level
  const getBarColor = (value: number) => {
    if (value <= 10) return '#ef4444' // red for low stock
    if (value <= 20) return '#f59e0b' // amber for medium-low
    return '#213cef' // brand blue for normal
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
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
          label={{ value: 'Units', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
