'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const inputClass =
  'bg-white border-slate-200 focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus-visible:border-brand-primary'

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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <p className="mt-4 text-lg font-bold text-emerald-800">Application received!</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-700">
          Thanks — our team will review your application and follow up by email, usually within
          1–2 business days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <Label htmlFor="orgName" className="mb-1.5 block text-sm font-medium text-slate-700">
          Organization name <span className="text-brand-primary">*</span>
        </Label>
        <Input
          id="orgName"
          name="orgName"
          required
          maxLength={200}
          placeholder="Acme Sales Group"
          autoComplete="organization"
          className={inputClass}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactName" className="mb-1.5 block text-sm font-medium text-slate-700">
            Contact name <span className="text-brand-primary">*</span>
          </Label>
          <Input
            id="contactName"
            name="contactName"
            required
            maxLength={200}
            placeholder="Jane Smith"
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
            Phone
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            maxLength={30}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Work email <span className="text-brand-primary">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          placeholder="jane@acmesales.com"
          autoComplete="email"
          className={inputClass}
        />
      </div>
      <div>
        <Label htmlFor="website" className="mb-1.5 block text-sm font-medium text-slate-700">
          Website
        </Label>
        <Input
          id="website"
          name="website"
          placeholder="https://acmesales.com"
          maxLength={255}
          autoComplete="url"
          className={inputClass}
        />
      </div>
      <div>
        <Label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-slate-700">
          Tell us about your sales network
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="Territories you cover, number of reps, the clinics you work with…"
          className={inputClass}
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={submitting}
        className="h-12 w-full rounded-xl bg-brand-primary text-base font-semibold text-white shadow-lg shadow-brand-primary/25 transition-colors hover:bg-brand-primary/90"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit application'
        )}
      </Button>
      <p className="text-center text-xs leading-relaxed text-slate-400">
        By applying you agree to be contacted about the PeptSci partner program.
      </p>
    </form>
  )
}
