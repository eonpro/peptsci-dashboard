import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { isValidReferralCode } from '@/lib/partners/referral'
import { JoinTeamForm } from './JoinTeamForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Join a sales team — PeptSci',
  robots: { index: false },
}

const LOGO_SRC = 'https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg'

/** Public rep application page reached through an org's shared join link. */
export default async function JoinTeamPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!prisma || !isValidReferralCode(code)) notFound()

  const org = await prisma.partnerOrg.findUnique({
    where: { teamJoinCode: code.toLowerCase() },
    select: { name: true, status: true },
  })
  if (!org || org.status !== 'ACTIVE') notFound()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-onyx px-6 py-16 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[140px]"
      />
      <main className="relative w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="PeptSci" className="mx-auto h-9 w-auto" />
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
            Sales team application
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight">
            Join {org.name}&rsquo;s team on PeptSci
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Apply to become a sales rep. Once the team owner approves you, you&rsquo;ll get an
            email invitation to set up your rep portal — links, clinics, and commissions included.
          </p>
          <div className="mt-6">
            <JoinTeamForm code={code.toLowerCase()} orgName={org.name} />
          </div>
        </div>
      </main>
    </div>
  )
}
