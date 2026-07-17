'use client'

import { useState } from 'react'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#213cef] focus:ring-2 focus:ring-[#213cef]/20'

export function ApplyForm() {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/partners/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName: form.get('orgName'),
          contactName: form.get('contactName'),
          email: form.get('email'),
          phone: form.get('phone') || '',
          website: form.get('website') || '',
          notes: form.get('notes') || '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || 'Could not submit your application. Please try again.')
        return
      }
      setDone(true)
    } catch {
      setError('Could not submit your application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-800">Application received!</p>
        <p className="mt-2 text-sm text-emerald-700">
          Thanks — our team will review your application and follow up by email, usually within
          1–2 business days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="orgName" className="mb-1 block text-sm font-medium">
          Organization name *
        </label>
        <input id="orgName" name="orgName" required maxLength={200} className={inputClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contactName" className="mb-1 block text-sm font-medium">
            Contact name *
          </label>
          <input id="contactName" name="contactName" required maxLength={200} className={inputClass} />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Phone
          </label>
          <input id="phone" name="phone" type="tel" maxLength={30} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Work email *
        </label>
        <input id="email" name="email" type="email" required maxLength={255} className={inputClass} />
      </div>
      <div>
        <label htmlFor="website" className="mb-1 block text-sm font-medium">
          Website
        </label>
        <input id="website" name="website" placeholder="https://" maxLength={255} className={inputClass} />
      </div>
      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">
          Tell us about your sales network
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} className={inputClass} />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-[#213cef] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a30c4] disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
      <p className="text-center text-xs text-slate-400">
        By applying you agree to be contacted about the PeptSci partner program.
      </p>
    </form>
  )
}
