import type { Metadata } from 'next'
import Link from 'next/link'
import { ApplyForm } from './ApplyForm'

export const metadata: Metadata = {
  title: 'Partner Program — PeptSci',
  description:
    'Join the PeptSci partner program: refer clinics, track your numbers, and earn commission on every attributed sale.',
}

const PERKS = [
  {
    title: 'Commission on every sale',
    body: 'Earn a share of every order placed by clinics you refer — tracked automatically, down to the cent.',
  },
  {
    title: 'Custom referral links',
    body: 'Create and label unlimited referral links for campaigns, events, or individual reps.',
  },
  {
    title: 'Build your team',
    body: 'Invite sales reps, set their commission carve-outs, and watch your whole book of business in one dashboard.',
  },
  {
    title: 'Real-time numbers',
    body: 'Revenue, commissions, payouts, and goals — live in your partner portal, exportable to CSV.',
  },
]

export default function PartnerApplyPage() {
  return (
    <div className="min-h-screen bg-[#050722] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-wide">
            PEPTSCI
          </Link>
          <Link href="/sign-in" className="text-sm text-white/70 hover:text-white">
            Partner sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-12 px-6 py-14 lg:grid-cols-2">
        <section>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7b8cff]">
            Partner program
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Grow with PeptSci. Earn on every clinic you bring.
          </h1>
          <p className="mt-4 text-white/70">
            Sales organizations and independent reps use the PeptSci partner program to refer
            clinics, manage pricing, and get paid — with transparent, automatic commission
            tracking.
          </p>
          <dl className="mt-10 space-y-6">
            {PERKS.map((perk) => (
              <div key={perk.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <dt className="font-semibold">{perk.title}</dt>
                <dd className="mt-1 text-sm text-white/70">{perk.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
          <h2 className="text-xl font-bold">Apply to become a partner</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tell us about your organization. We review every application and usually respond
            within 1–2 business days.
          </p>
          <div className="mt-6">
            <ApplyForm />
          </div>
        </section>
      </main>
    </div>
  )
}
