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

const usd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function TrendChart({
  data,
}: {
  data: Array<{ month: string; revenue: number; commission: number }>
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
          <Tooltip formatter={(value: number | string) => usd(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue" name="Revenue" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
          <Line dataKey="commission" name="Commission" stroke="#213cef" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
