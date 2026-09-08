import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell, Package, ShieldCheck, Truck } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { SmsSignupForm } from './SmsSignupForm'
import {
  SMS_HELP_MESSAGE,
  SMS_OPT_IN_CONFIRMATION,
  SMS_OPT_OUT_CONFIRMATION,
  SMS_PRIVACY_PATH,
  SMS_PROGRAM_NAME,
  SMS_SUPPORT_EMAIL,
  SMS_TERMS_PATH,
} from '@/lib/sms/program'

export const metadata: Metadata = {
  title: `${SMS_PROGRAM_NAME} — Text message updates from PeptSci`,
  description:
    'Sign up for PeptSci Alerts: order, shipping, and account updates by text message. Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
}

const WHAT_YOU_GET = [
  { icon: Package, title: 'Order updates', body: 'Confirmation when your order is received and when it is being prepared.' },
  { icon: Truck, title: 'Shipping & delivery', body: 'Tracking link when your order ships, plus delivery and exception notices.' },
  { icon: Bell, title: 'Account alerts', body: 'Verification, security, invoice reminders, and replies to your support requests.' },
]

const PROGRAM_FACTS: Array<[string, string]> = [
  ['Program name', SMS_PROGRAM_NAME],
  ['Message frequency', 'Varies with your order and account activity'],
  ['Cost', 'Message and data rates may apply per your carrier plan'],
  ['Cancel', 'Reply STOP to any message, or turn off SMS in Account Settings → SMS Preferences'],
  ['Help', `Reply HELP to any message, or email ${SMS_SUPPORT_EMAIL}`],
  ['Consent', 'Optional — not a condition of purchase or of having an account'],
  ['Privacy', 'Your mobile number is never shared with third parties for marketing'],
]

/** Public PeptSci Alerts landing + opt-in (the "sign up for texts" area). */
export default function SmsSignupPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-onyx font-sofia text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[6%] h-[460px] w-[460px] rounded-full bg-brand-primary/25 blur-[160px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-12">
        <Link href="/" aria-label="Back to home" className="inline-block">
          <Logo variant="light" width={184} height={62} />
        </Link>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <section>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-primary/40 bg-brand-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
              {SMS_PROGRAM_NAME}
            </p>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Order, shipping, and account updates by text.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
              {SMS_PROGRAM_NAME} keeps licensed practices informed without checking email — one
              short text when your order is received, when it ships, and when something needs your
              attention. No promotions, no marketing.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {WHAT_YOU_GET.map((item) => (
                <li key={item.title} className="rounded-2xl bg-white/5 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/15 text-indigo-300">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <p className="mt-3 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">{item.body}</p>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl bg-white/5 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
                <ShieldCheck className="h-4 w-4 text-indigo-300" />
                Program details
              </h2>
              <dl className="mt-4 divide-y divide-white/10">
                {PROGRAM_FACTS.map(([term, detail]) => (
                  <div key={term} className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr]">
                    <dt className="text-xs font-medium uppercase tracking-wide text-white/45">{term}</dt>
                    <dd className="text-sm text-white/80">{detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-white/45">
                Full terms:{' '}
                <Link href={SMS_TERMS_PATH} className="text-[#8b95ff] underline hover:text-white">
                  Terms of Service §14 (SMS / Text Message Terms)
                </Link>{' '}
                ·{' '}
                <Link href={SMS_PRIVACY_PATH} className="text-[#8b95ff] underline hover:text-white">
                  Privacy Policy §7.2
                </Link>
              </p>
            </div>

            <div className="mt-6 space-y-2 text-xs text-white/45">
              <p className="font-medium uppercase tracking-wide text-white/55">What you will receive</p>
              <p className="rounded-lg bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/70">
                {SMS_OPT_IN_CONFIRMATION}
              </p>
              <p className="rounded-lg bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/70">
                {SMS_HELP_MESSAGE}
              </p>
              <p className="rounded-lg bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/70">
                {SMS_OPT_OUT_CONFIRMATION}
              </p>
            </div>
          </section>

          <section id="signup" className="lg:pt-2">
            <div className="lg:sticky lg:top-8">
              <div className="overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl shadow-black/40 ring-1 ring-white/20">
                <div className="h-1.5 bg-gradient-to-r from-brand-primary via-indigo-500 to-blue-400" />
                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold tracking-tight">Sign up for text updates</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Enter the mobile number you want us to text and check the consent box. Already
                    have an account? You can also turn this on under{' '}
                    <Link href="/shop/account#sms-preferences" className="font-medium text-brand-primary underline">
                      Account Settings → SMS Preferences
                    </Link>
                    .
                  </p>
                  <div className="mt-6">
                    <SmsSignupForm />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-white/30">
          <Link href="/" className="transition-colors hover:text-white/60">
            peptsci.com
          </Link>
          <span aria-hidden>•</span>
          <Link href="/termsandconditions" className="transition-colors hover:text-white/60">
            Terms
          </Link>
          <span aria-hidden>•</span>
          <Link href="/privacy" className="transition-colors hover:text-white/60">
            Privacy
          </Link>
          <span aria-hidden>•</span>
          <span>© {new Date().getFullYear()} PeptSci</span>
        </div>
      </div>
    </div>
  )
}
