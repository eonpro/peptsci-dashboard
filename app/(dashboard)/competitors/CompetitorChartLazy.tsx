'use client'

import dynamic from 'next/dynamic'

// recharts is heavy; load it on the client only (this page is a Server
// Component, so the dynamic + ssr:false boundary has to live in a client file).
const CompetitorChart = dynamic(() => import('./CompetitorChart'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full animate-pulse rounded-xl bg-muted/40" />
  ),
})

interface ChartData {
  name: string
  ourPrice: number
  theirPrice: number
  competitor: string
}

export default function CompetitorChartLazy({ data }: { data: ChartData[] }) {
  return <CompetitorChart data={data} />
}
