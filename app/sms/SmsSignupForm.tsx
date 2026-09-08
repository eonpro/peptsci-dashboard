'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SmsConsentText } from '@/components/sms/SmsConsentText'
import { SMS_PROGRAM_NAME, SMS_SUPPORT_EMAIL } from '@/lib/sms/program'

const inputClass =
  'h-12 bg-white border-slate-200 text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-primary/60 focus-visible:border-brand-primary'

/**
 * Public PeptSci Alerts opt-in form. The consent checkbox is never
 * pre-checked and consent is never required for anything else on the site.
 */
export function SmsSignupForm() {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ phone: string; confirmationSent: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!consent) {
      setError('Please check the box to consent to text messages.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/sms/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email, consent }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || 'Could not save your preference. Please try again.')
        return
      }
      setDone({ phone: data.phone, confirmationSent: data.confirmationSent === true })
    } catch {
      setError('Could not save your preference. Please try again.')
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
        <p className="mt-4 text-lg font-bold text-emerald-800">You&apos;re subscribed to {SMS_PROGRAM_NAME}</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-700">
          We saved your consent for <span className="font-semibold">{done.phone}</span>.{' '}
          {done.confirmationSent
            ? 'A confirmation text is on its way.'
            : 'You will receive a confirmation text once messaging is live.'}{' '}
          Reply <strong>STOP</strong> at any time to cancel or <strong>HELP</strong> for help.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="sms-phone" className="text-sm font-medium text-slate-700">
          Mobile phone number
        </Label>
        <Input
          id="sms-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(813) 555-0142"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-slate-500">US mobile numbers only. Standard 10-digit format.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sms-email" className="text-sm font-medium text-slate-700">
          Email <span className="font-normal text-slate-400">(optional — helps us match your account)</span>
        </Label>
        <Input
          id="sms-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@practice.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* TCPA / A2P consent: un-prechecked, directly below the phone field. */}
      <label
        htmlFor="sms-consent"
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <input
          id="sms-consent"
          name="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          // Drawn explicitly: the global input reset hides the native box.
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded border-2 border-slate-400 bg-white transition-colors checked:border-brand-primary checked:bg-brand-primary checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-center checked:bg-no-repeat focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
        />
        <span className="text-sm leading-relaxed text-slate-700">
          <SmsConsentText linkClassName="font-medium text-brand-primary underline" />
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting || !consent}
        className="h-12 w-full rounded-xl bg-brand-primary text-base font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <MessageSquare className="mr-2 h-4 w-4" /> Sign up for {SMS_PROGRAM_NAME}
          </>
        )}
      </Button>

      <p className="text-center text-xs leading-relaxed text-slate-500">
        Consent is not a condition of purchase. Questions? Email{' '}
        <a href={`mailto:${SMS_SUPPORT_EMAIL}`} className="underline">
          {SMS_SUPPORT_EMAIL}
        </a>
        .
      </p>
    </form>
  )
}
