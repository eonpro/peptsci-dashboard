'use client'

import { useState } from 'react'

const inputClass =
  'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-brand-primary'

export function JoinTeamForm({ code, orgName }: { code: string; orgName: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/team-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone') || '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || 'Could not submit your application.')
        return
      }
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center">
        <p className="font-semibold text-emerald-300">Application sent!</p>
        <p className="mt-1 text-sm text-white/60">
          {orgName} will review your application — once approved, check your email for the
          sign-up invitation.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input name="name" required maxLength={200} placeholder="Full name *" className={inputClass} />
      <input name="email" type="email" required maxLength={255} placeholder="Email *" className={inputClass} />
      <input name="phone" maxLength={30} placeholder="Phone" className={inputClass} />
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Apply to join'}
      </button>
    </form>
  )
}
