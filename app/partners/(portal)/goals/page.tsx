'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '../_components/PageHeader'

interface GoalRow {
  id: string
  repId: string | null
  repName: string | null
  metric: 'REVENUE' | 'COMMISSION'
  period: 'MONTH' | 'QUARTER' | 'YEAR'
  targetCents: number
  actualCents: number
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const PERIOD_LABEL = { MONTH: 'This month', QUARTER: 'This quarter', YEAR: 'This year' } as const
const METRIC_LABEL = { REVENUE: 'Revenue', COMMISSION: 'Commission' } as const

export default function PartnerGoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/goals')
      const data = await res.json()
      if (res.ok) setGoals(data.goals)
      else toast.error(data.message || 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setSaving(true)
    try {
      const res = await fetch('/api/partners/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric: form.get('metric'),
          period: form.get('period'),
          target: Number(form.get('target') || 0),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Failed to save goal')
        return
      }
      toast.success('Goal saved')
      formEl.reset()
      void load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Set revenue or commission targets and track progress in real time. Setting a target of $0 removes the goal."
      />

      <Card>
        <CardContent className="p-4">
      <form onSubmit={saveGoal} className="flex flex-wrap items-end gap-2">
        {/* Native selects: this form is read via FormData by name, which Radix
            Select doesn't participate in. */}
        <select
          name="metric"
          aria-label="Metric"
          className="h-10 rounded-md border border-input bg-white px-3 text-sm"
        >
          <option value="REVENUE">Revenue</option>
          <option value="COMMISSION">Commission</option>
        </select>
        <select
          name="period"
          aria-label="Period"
          className="h-10 rounded-md border border-input bg-white px-3 text-sm"
        >
          <option value="MONTH">Monthly</option>
          <option value="QUARTER">Quarterly</option>
          <option value="YEAR">Yearly</option>
        </select>
        <Input
          name="target"
          type="number"
          step="1"
          min="0"
          required
          placeholder="Target $"
          aria-label="Target dollars"
          className="w-32 bg-white"
        />
        <Button type="submit" disabled={saving} className="font-semibold">
          {saving ? 'Saving…' : 'Set goal'}
        </Button>
      </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </Card>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Set your first target above."
            className="py-10"
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const pct = goal.targetCents > 0 ? Math.min(100, (goal.actualCents / goal.targetCents) * 100) : 0
            return (
              <Card key={goal.id} className="p-5">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold text-slate-900">
                    {METRIC_LABEL[goal.metric]} · {PERIOD_LABEL[goal.period]}
                  </p>
                  {goal.repName && <span className="text-xs text-slate-400">{goal.repName}</span>}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  <strong className="text-slate-900">{usd(goal.actualCents)}</strong> of {usd(goal.targetCents)}{' '}
                  ({Math.round(pct)}%)
                </p>
                <Progress
                  value={pct}
                  className={cn('mt-2 h-2.5 bg-slate-100', pct >= 100 && '[&>div]:bg-emerald-500')}
                />
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
