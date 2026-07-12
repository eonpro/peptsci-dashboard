import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { AlertCircle } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { FOOTER_DISCLAIMER } from '@/lib/legal/terms-of-service'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

const FOOTER_LINKS = [
  { label: 'Terms of Use', href: '/termsandconditions' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Payments and Shipping', href: 'https://peptsci.com/payments-and-shipping' },
]

export default async function RootPage() {
  // If Clerk is not configured, go to dashboard (dev mode)
  if (!isClerkConfigured) {
    redirect('/dashboard')
  }

  // Signed-in users skip the landing page and go straight to their area
  const { userId, sessionClaims } = await auth()
  if (userId) {
    const role = (sessionClaims?.metadata as { role?: string })?.role || 'CLIENT'
    redirect(role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/dashboard' : '/shop')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-onyx font-sofia text-white">
      {/* Ambient gradient glows (same treatment as the auth screens) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[6%] h-[460px] w-[460px] rounded-full bg-brand-primary/25 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[2%] h-[420px] w-[420px] rounded-full bg-[#7a5bff]/20 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-16">
        {/* Logo */}
        <div className="mt-4">
          <Logo variant="light" width={280} height={94} />
        </div>

        {/* Auth actions */}
        <div className="mt-12 flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-in"
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-white/5 text-[15px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] transition-all duration-200 hover:bg-white/9 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.20)]"
          >
            Log In
          </Link>
          <Link
            href="/sign-up"
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-linear-to-r from-[#2342f0] to-[#7a5bff] text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(67,76,255,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_16px_38px_-8px_rgba(67,76,255,0.9)]"
          >
            New Account
          </Link>
        </div>

        {/* Research-use disclaimer */}
        <div className="mt-16 w-full rounded-2xl bg-white/5 p-8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-white">
                All product and informational content on this website is intended solely for
                educational and research purposes.
              </p>
              <p className="text-sm leading-relaxed text-white/75">
                The materials offered are designed for in-vitro laboratory use only (meaning
                experiments conducted outside of living organisms). These substances are not
                drugs, medicines, or therapeutic agents, and have not been evaluated or approved
                by the FDA to diagnose, treat, prevent, or cure any disease or medical condition.
              </p>
              <p className="text-sm leading-relaxed text-white/75">
                Any human or animal use, consumption, or bodily introduction of these materials
                is strictly prohibited by law.
              </p>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-12 flex flex-wrap items-center justify-center text-sm text-white/70">
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.href} className="flex items-center">
              {i > 0 && <span className="mx-3 text-white/25" aria-hidden>|</span>}
              <Link href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            </span>
          ))}
        </div>

        {/* Copyright / legal */}
        <p className="mt-8 max-w-2xl text-center text-xs leading-relaxed text-white/40">
          © {new Date().getFullYear()} PeptSci. All Rights Reserved. {FOOTER_DISCLAIMER}
        </p>
      </div>
    </div>
  )
}
