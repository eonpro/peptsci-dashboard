'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
        <Label htmlFor="orgName" className="mb-1 block">
          Organization name *
        </Label>
        <Input id="orgName" name="orgName" required maxLength={200} className="bg-white" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactName" className="mb-1 block">
            Contact name *
          </Label>
          <Input id="contactName" name="contactName" required maxLength={200} className="bg-white" />
        </div>
        <div>
          <Label htmlFor="phone" className="mb-1 block">
            Phone
          </Label>
          <Input id="phone" name="phone" type="tel" maxLength={30} className="bg-white" />
        </div>
      </div>
      <div>
        <Label htmlFor="email" className="mb-1 block">
          Work email *
        </Label>
        <Input id="email" name="email" type="email" required maxLength={255} className="bg-white" />
      </div>
      <div>
        <Label htmlFor="website" className="mb-1 block">
          Website
        </Label>
        <Input id="website" name="website" placeholder="https://" maxLength={255} className="bg-white" />
      </div>
      <div>
        <Label htmlFor="notes" className="mb-1 block">
          Tell us about your sales network
        </Label>
        <Textarea id="notes" name="notes" rows={3} maxLength={2000} className="bg-white" />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full font-semibold">
        {submitting ? 'Submitting…' : 'Submit application'}
      </Button>
      <p className="text-center text-xs text-slate-400">
        By applying you agree to be contacted about the PeptSci partner program.
      </p>
    </form>
  )
}
