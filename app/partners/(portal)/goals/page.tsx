'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Goals</h1>
        <p className="text-sm text-slate-500">
          Set revenue or commission targets and track progress in real time. Setting a target of
          $0 removes the goal.
        </p>
      </div>

      <form onSubmit={saveGoal} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
        <select name="metric" className="rounded-md border px-3 py-2 text-sm">
          <option value="REVENUE">Revenue</option>
          <option value="COMMISSION">Commission</option>
        </select>
        <select name="period" className="rounded-md border px-3 py-2 text-sm">
          <option value="MONTH">Monthly</option>
          <option value="QUARTER">Quarterly</option>
          <option value="YEAR">Yearly</option>
        </select>
        <input
          name="target"
          type="number"
          step="1"
          min="0"
          required
          placeholder="Target $"
          className="w-32 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Set goal'}
        </button>
      </form>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="rounded-xl border bg-white py-10 text-center text-sm text-slate-400">
          No goals yet — set your first target above.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const pct = goal.targetCents > 0 ? Math.min(100, (goal.actualCents / goal.targetCents) * 100) : 0
            return (
              <div key={goal.id} className="rounded-xl border bg-white p-5">
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
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-[#213cef]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
