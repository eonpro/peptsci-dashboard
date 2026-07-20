import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { CopyRefButton } from './CopyRefButton'

export const metadata: Metadata = {
  title: 'Application received — PeptSci',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

const LOGO_SRC = 'https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg'

/** Sanitized display reference — never reflect arbitrary query input. */
function cleanRef(raw: string | undefined): string | null {
  if (!raw) return null
  const ref = raw.trim().toUpperCase()
  return /^[A-Z]{2,4}-\d{8}-[A-Z0-9]{3,8}$/.test(ref) ? ref : null
}

/**
 * Standalone confirmation page for completed applications (partner program
 * and clinic onboarding): /thank-you?form=partner|clinic&ref=PRT-20260719-8K4Q
 */
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string; ref?: string }>
}) {
  const params = await searchParams
  const ref = cleanRef(params.ref)
  const form = params.form === 'partner' ? 'partner' : 'clinic'

  const copy =
    form === 'partner'
      ? {
          heading: 'Your partner application is in.',
          body: 'Our team reviews every application — you\u2019ll hear back by email, usually within 1\u20132 business days. Once approved, you\u2019ll receive a sign-up invitation for your partner portal.',
          footerLink: { href: '/partners/apply', label: 'Back to the partner program' },
        }
      : {
          heading: 'Your application is in.',
          body: 'Our team is verifying your practice credentials — you\u2019ll receive an email as soon as your account is approved and ready to order, usually within 1\u20132 business days.',
          footerLink: { href: '/pending-approval', label: 'Check your account status' },
        }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-onyx px-6 text-white">
      {/* Ambient brand glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-15%] right-[5%] h-[380px] w-[380px] rounded-full bg-brand-primary/25 blur-[140px]"
      />

      <main className="relative w-full max-w-lg text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="PeptSci" className="mx-auto h-9 w-auto" />

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{copy.heading}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">{copy.body}</p>

          {ref && (
            <div className="mt-8 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
                Your application number
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-white sm:text-3xl">
                {ref}
              </p>
              <div className="mt-3 flex justify-center">
                <CopyRefButton value={ref} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/45">
                Save this number — include it in any email or call about your application so we
                can pull it up instantly.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60">
          <Link href={copy.footerLink.href} className="transition-colors hover:text-white">
            {copy.footerLink.label}
          </Link>
          <span aria-hidden className="hidden text-white/20 sm:inline">
            |
          </span>
          <Link href="/" className="transition-colors hover:text-white">
            peptsci.com
          </Link>
        </div>
      </main>
    </div>
  )
}
