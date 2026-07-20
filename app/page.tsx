import type { Viewport } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { AlertCircle, ChevronDown, FileCheck2, ShieldCheck, Truck } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { ThemeScope } from '@/components/ThemeScope'
import { FOOTER_DISCLAIMER } from '@/lib/legal/terms-of-service'
import { defaultRouteForRole } from '@/lib/access'

// Tint mobile browser chrome (status bar / URL bar) onyx to match the page.
export const viewport: Viewport = {
  themeColor: '#050722',
}

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

const FOOTER_LINKS = [
  { label: 'Terms of Use', href: '/termsandconditions' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refunds', href: '/refunds' },
  { label: 'Shipping', href: '/shipping' },
]

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: 'Third-party tested', detail: 'Independent purity verification' },
  { icon: FileCheck2, label: 'COA with every batch', detail: 'Certificates of analysis on file' },
  { icon: Truck, label: 'Fast, tracked fulfillment', detail: 'Cold-chain aware shipping' },
]

/*
  First-visit splash: runs BEFORE the overlay markup is parsed so repeat
  visitors never see a flash. First visit in a session plays the CSS-driven
  intro (see #brand-splash in globals.css) and the node self-removes after
  the timeline finishes.
*/
const SPLASH_SCRIPT = `(function(){try{var k='peptsci-splash-seen';if(sessionStorage.getItem(k)){document.documentElement.classList.add('splash-seen')}else{sessionStorage.setItem(k,'1');setTimeout(function(){var e=document.getElementById('brand-splash');if(e)e.remove()},3200)}}catch(e){}})();`

export default async function RootPage() {
  // If Clerk is not configured, go to dashboard (dev mode)
  if (!isClerkConfigured) {
    redirect('/dashboard')
  }

  // Signed-in users skip the landing page and go straight to their area
  const { userId, sessionClaims } = await auth()
  if (userId) {
    const role = (sessionClaims?.metadata as { role?: string })?.role || 'CLIENT'
    redirect(defaultRouteForRole(role))
  }

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-brand-onyx font-sofia text-white">
      {/* Hoist .dark to <html> so the body canvas (bg-background) turns onyx —
          otherwise mobile overscroll exposes the light-beige :root background
          above/below the dark page. */}
      <ThemeScope theme="dark" />
      {/* First-visit brand splash (heartbeat → blue flood → reveal) */}
      <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      <div id="brand-splash" aria-hidden="true">
        <div className="splash-flood" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/peptsci-icon-transparent.png" alt="" className="splash-icon" />
      </div>

      {/* Ambient gradient glows (same treatment as the auth screens) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[6%] h-[460px] w-[460px] rounded-full bg-brand-primary/25 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[2%] h-[420px] w-[420px] rounded-full bg-[#7a5bff]/20 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-12 pt-6 sm:px-6">
        {/* Top bar: logo + quick log-in */}
        <header className="flex items-center justify-between">
          <Logo variant="light" width={132} height={44} />
          <Link
            href="/sign-in"
            className="rounded-full px-4 py-2 text-sm font-medium text-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-colors hover:bg-white/5 hover:text-white"
          >
            Log in
          </Link>
        </header>

        {/* Hero banner */}
        <section className="flex flex-1 flex-col justify-center py-8 sm:py-12">
          <div className="overflow-hidden rounded-3xl bg-[#0a0d33] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            {/* Copy + image row (image stays out of the trust strip below) */}
            <div className="relative">
              {/* Doctor image: full-width on mobile (fades into the card below),
                  right column on larger screens (fades into the copy) */}
              <div className="relative h-72 w-full sm:absolute sm:inset-y-0 sm:right-0 sm:h-auto sm:w-[44%]">
                <Image
                  src="/landing/doctor-hero-v3.png"
                  alt="Physician presenting on a smartphone"
                  fill
                  priority
                  sizes="(max-width: 640px) 100vw, 44vw"
                  className="object-cover object-[center_22%] sm:object-center"
                />
                <div
                  className="absolute inset-0 bg-linear-to-t from-[#0a0d33] via-[#0a0d33]/25 to-transparent sm:bg-linear-to-r sm:from-[#0a0d33] sm:via-[#0a0d33]/30 sm:to-transparent"
                  aria-hidden
                />
              </div>

              {/* Copy */}
              <div className="relative -mt-10 p-6 pb-8 sm:mt-0 sm:w-[62%] sm:p-10 sm:pb-10 lg:p-12">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" aria-hidden />
                Members-only research platform
              </span>

              <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.75rem]">
                Advancing Physician-Led Precision Care with{' '}
                <span className="bg-linear-to-r from-[#5b74ff] to-[#a08bff] bg-clip-text text-transparent">
                  Trusted Peptide Solutions
                </span>
              </h1>

              <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-white/65">
                Third-party tested compounds with certificates of analysis, exclusive practice
                pricing, and fast tracked fulfillment.
              </p>

              {/* CTAs */}
              <div className="mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-linear-to-r from-[#2342f0] to-[#7a5bff] px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(67,76,255,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_16px_38px_-8px_rgba(67,76,255,0.9)]"
                >
                  Create your account
                </Link>
                <Link
                  href="/sign-in"
                  className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white/5 px-6 text-[15px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-all duration-200 hover:bg-white/9 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]"
                >
                  Log in
                </Link>
              </div>
            </div>
            </div>

            {/* Trust strip (inside the banner, like the shop hero) */}
            <div className="grid gap-4 border-t border-white/10 px-6 py-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/10 sm:px-10">
              {TRUST_ITEMS.map(({ icon: Icon, label, detail }) => (
                <div key={label} className="flex items-center gap-3 sm:justify-center sm:px-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 text-[#7a8dff]">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-white/55">
                      {detail}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Research-use disclaimer (compact, expandable) */}
        <section className="rounded-2xl bg-white/4 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] sm:p-6">
          <div className="flex items-start gap-3.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0 space-y-2">
              <p className="text-[13px] font-semibold uppercase leading-snug tracking-wide text-white">
                For laboratory research and in-vitro testing only
              </p>
              <p className="text-[13px] leading-relaxed text-white/65">
                Products are not intended or offered for human or veterinary use. They are not
                medicines, supplements, cosmetics, or therapeutic agents, and have not been
                evaluated or approved by the FDA.
              </p>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-[#8b9bff] transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                  Read the full disclaimer
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-white/65">
                  <p>
                    Do not consume, inject, inhale, apply to the body, administer to humans or
                    animals, or otherwise introduce these products into any living organism.
                  </p>
                  <p>
                    Purchasers are responsible for ensuring that products are handled only by
                    qualified individuals in an appropriate laboratory setting and in compliance
                    with all applicable federal, state, and local laws, regulations, and
                    institutional requirements.
                  </p>
                  <p>
                    By purchasing from this website, you confirm that the products will be used
                    solely for lawful research purposes and not for personal, clinical,
                    diagnostic, therapeutic, or veterinary use.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10">
          <div className="flex flex-wrap items-center justify-center gap-y-2 text-sm text-white/60">
            {FOOTER_LINKS.map((link, i) => (
              <span key={link.href} className="flex items-center">
                {i > 0 && (
                  <span className="mx-3 text-white/20" aria-hidden>
                    |
                  </span>
                )}
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </span>
            ))}
          </div>
          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/35">
            © {new Date().getFullYear()} PeptSci. All Rights Reserved. {FOOTER_DISCLAIMER}
          </p>
        </footer>
      </div>
    </div>
  )
}
