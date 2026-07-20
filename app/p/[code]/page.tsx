import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, FlaskConical, ShieldCheck, Truck } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { isValidReferralCode } from '@/lib/partners/referral'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'You\u2019re invited — PeptSci',
  robots: { index: false },
}

const LOGO_SRC = 'https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg'

const POINTS = [
  { icon: FlaskConical, text: 'COA-verified, third-party tested research peptides' },
  { icon: BadgeCheck, text: 'Practice pricing applied automatically at checkout' },
  { icon: Truck, text: 'Fast fulfillment with free 2-day shipping over $500' },
  { icon: ShieldCheck, text: 'Licensed-practice verification on every account' },
]

/**
 * Co-branded referral landing: /p/<code>. Shows who invited the clinic and
 * why to join; the CTA goes through /join/<code> which records the click and
 * sets the 90-day attribution cookie.
 */
export default async function PartnerLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  if (!prisma || !isValidReferralCode(code)) notFound()

  const link = await prisma.referralLink.findUnique({
    where: { code: code.toLowerCase() },
    select: {
      active: true,
      org: { select: { name: true, status: true } },
      rep: { select: { name: true } },
    },
  })
  if (!link || !link.active || link.org.status !== 'ACTIVE') notFound()

  const inviter = link.rep?.name ? `${link.rep.name} · ${link.org.name}` : link.org.name

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-onyx px-6 py-16 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-15%] right-[5%] h-[380px] w-[380px] rounded-full bg-brand-primary/25 blur-[140px]"
      />

      <main className="relative w-full max-w-xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="PeptSci" className="mx-auto h-9 w-auto" />

        <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-brand-primary/40 bg-brand-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          Personal invitation
        </p>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          <span className="text-white/70">You&rsquo;ve been invited by</span>
          <br />
          {inviter}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
          Join PeptSci — the members-only platform for licensed practices to order high-purity,
          third-party-tested research peptides with transparent practice pricing.
        </p>

        <ul className="mx-auto mt-8 grid max-w-md gap-3 text-left">
          {POINTS.map((point) => (
            <li
              key={point.text}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
            >
              <point.icon className="h-5 w-5 shrink-0 text-brand-primary" />
              {point.text}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`/join/${encodeURIComponent(code.toLowerCase())}`}
            className="rounded-xl bg-brand-primary px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-primary/40 transition-colors hover:bg-brand-primary/90"
          >
            Accept invitation &amp; create account
          </a>
          <Link
            href="/sign-in"
            className="rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            I already have an account
          </Link>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-white/35">
          For licensed practices and laboratory research use only. Account approval requires
          practice verification.
        </p>
      </main>
    </div>
  )
}
