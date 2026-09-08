'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SmsConsentText } from '@/components/sms/SmsConsentText'
import { SMS_PROGRAM_NAME, SMS_SIGNUP_PATH } from '@/lib/sms/program'

/**
 * TCPA / Twilio A2P web opt-in shown on the public sign-up page.
 *
 * The Clerk <SignUp> card is a hosted component, so the checkbox lives directly
 * below it. The choice is stashed in localStorage and read by the onboarding
 * form, which persists it (smsOptIn/smsOptInAt) when the account is created.
 * Compliance requirements: never pre-checked, consent never required.
 */
export const SMS_OPT_IN_STORAGE_KEY = 'peptsci_sms_opt_in'

export function SmsOptInConsent() {
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  // Restore a previous choice (e.g. user bounced back from verification).
  useEffect(() => {
    try {
      setChecked(window.localStorage.getItem(SMS_OPT_IN_STORAGE_KEY) === 'true')
    } catch {
      /* storage unavailable — leave unchecked */
    }
  }, [])

  // Only show on the initial sign-up step, not on Clerk's follow-up steps
  // (e.g. /sign-up/verify-email-address, /sign-up/continue).
  if (pathname !== '/sign-up' && pathname !== '/sign-up/') return null

  const onToggle = (value: boolean) => {
    setChecked(value)
    try {
      window.localStorage.setItem(SMS_OPT_IN_STORAGE_KEY, value ? 'true' : 'false')
    } catch {
      /* storage unavailable — onboarding checkbox still collects consent */
    }
  }

  return (
    <div className="mx-auto mt-5 w-full rounded-xl bg-white/5 p-4 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-white/25 bg-white/5 transition-colors checked:border-[#7a5bff] checked:bg-[#5B4BFF] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-center checked:bg-no-repeat"
        />
        <span className="text-xs leading-relaxed text-white/60">
          <SmsConsentText linkClassName="text-[#8b95ff] underline transition-colors hover:text-white" />
        </span>
      </label>
      <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">
        {SMS_PROGRAM_NAME} sends automated order, shipping, and account updates to the mobile
        number you provide. Optional — you can also enroll later in Account Settings → SMS
        Preferences or at{' '}
        <Link href={SMS_SIGNUP_PATH} className="underline transition-colors hover:text-white">
          peptsci.com{SMS_SIGNUP_PATH}
        </Link>
        .
      </p>
    </div>
  )
}
