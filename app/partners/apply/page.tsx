import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Link2,
  Rocket,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react'
import { ApplyForm } from './ApplyForm'

export const metadata: Metadata = {
  title: 'Partner Program — PeptSci',
  description:
    'Join the PeptSci partner program: refer clinics, track your numbers, and earn commission on every attributed sale.',
}

const LOGO_SRC = 'https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg'

const TRUST_POINTS = [
  'Free to join — no fees, no minimums',
  'Commission tracked automatically on every attributed order',
  'Dedicated partner portal with live revenue and payout data',
]

const PERKS = [
  {
    icon: BadgeDollarSign,
    title: 'Revenue on autopilot',
    body: 'Earn on every order placed by clinics you refer — recurring, not one-time, tracked automatically down to the cent.',
  },
  {
    icon: Link2,
    title: 'Custom referral links',
    body: 'Create and label unlimited referral links for campaigns, events, or individual reps — every click and signup counted.',
  },
  {
    icon: Users,
    title: 'Build your team',
    body: 'Invite sales reps, set their commission carve-outs, and watch your whole book of business in one dashboard.',
  },
  {
    icon: BarChart3,
    title: 'Real-time numbers',
    body: 'Revenue, commissions, payouts, and goals — live in your partner portal, exportable to CSV or over our partner API.',
  },
  {
    icon: Wallet,
    title: 'Effortless payouts',
    body: 'Approved commissions are paid on a regular schedule, with every payout logged against your ledger — no invoices, no spreadsheets.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Flexible reward structures',
    body: 'Classic revenue-share commission, or margin-model pricing where you set clinic prices above your floor and keep the spread.',
  },
]

const STEPS = [
  {
    icon: ClipboardCheck,
    title: 'Apply in 2 minutes',
    body: 'Tell us about your organization and sales network. We review every application within 1–2 business days.',
  },
  {
    icon: Link2,
    title: 'Get your links',
    body: 'Once approved, sign your agreement and generate referral links for your clinics, campaigns, and reps.',
  },
  {
    icon: Rocket,
    title: 'Earn on every order',
    body: 'Every attributed order earns you commission automatically — watch it accrue live in your portal.',
  },
]

export default function PartnerApplyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-onyx text-white">
      {/* Decorative background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-brand-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-48 h-[28rem] w-[28rem] rounded-full bg-indigo-500/15 blur-3xl"
      />

      <header className="relative border-b border-white/10 bg-brand-onyx/80 backdrop-blur-xl">
        <div className="mx-auto flex container items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center" aria-label="PeptSci home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_SRC} alt="PeptSci" className="h-8 w-auto md:h-9" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Partner sign in
            </Link>
            <a
              href="#apply"
              className="hidden rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-primary/30 transition-colors hover:bg-brand-primary/90 sm:inline-block"
            >
              Apply now
            </a>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Full-width hero banner (image right, matching the shop hero) */}
        <div className="mx-auto container px-6 pt-10">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#04061c]">
            {/* Banner art: interlocked partner rings. The image's left half is
                the same navy as the card, so it runs full-bleed and needs only
                a light fade behind the copy. */}
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/partners-hero.png"
                alt=""
                aria-hidden
                className="h-full w-full object-cover object-right"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#04061c] via-[#04061c]/55 to-transparent lg:via-40%" />
            </div>

            <div className="relative px-8 pb-8 pt-12 sm:px-12 sm:pt-16 lg:max-w-[58%]">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-primary/40 bg-brand-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                Partner program
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
                Grow your revenue{' '}
                <span className="bg-gradient-to-r from-indigo-300 via-blue-400 to-brand-primary bg-clip-text text-transparent">
                  with partnerships.
                </span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
                The PeptSci partner program for sales organizations, distributors, and independent
                reps: refer clinics, control pricing, and earn on every order they place —
                automatically, transparently, forever.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#apply"
                  className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white/90"
                >
                  Apply to the program
                </a>
                <Link
                  href="/sign-in"
                  className="rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Partner sign in
                </Link>
              </div>

              {/* Trust strip (shop-hero style divided stats) */}
              <div className="mt-12 grid gap-6 border-t border-white/10 pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/10">
                {[
                  ['Automatic tracking', 'Every attributed order, to the cent'],
                  ['Effortless payouts', 'Approved commissions, on schedule'],
                  ['Live partner portal', 'Revenue, clinics, and payouts in real time'],
                ].map(([title, body]) => (
                  <div key={title} className="sm:px-6 sm:first:pl-0 sm:last:pr-0">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/50">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Perks + form */}
        <div className="mx-auto grid container gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <section>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Everything you need to build a book of business
            </h2>
            <ul className="mt-6 space-y-3">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                  {point}
                </li>
              ))}
            </ul>

            <dl className="mt-10 grid gap-4 sm:grid-cols-2">
              {PERKS.map((perk) => (
                <div
                  key={perk.title}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-brand-primary/50 hover:bg-white/[0.08]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/15 text-indigo-300 transition-colors group-hover:bg-brand-primary/25">
                    <perk.icon className="h-5 w-5" />
                  </div>
                  <dt className="mt-4 font-semibold">{perk.title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-white/60">{perk.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="apply" className="lg:pt-2">
            <div className="lg:sticky lg:top-8">
              <div className="overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl shadow-black/40 ring-1 ring-white/20">
                <div className="h-1.5 bg-gradient-to-r from-brand-primary via-indigo-500 to-blue-400" />
                <div className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold tracking-tight">Apply to become a partner</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Tell us about your organization. We review every application and usually
                    respond within 1–2 business days.
                  </p>
                  <div className="mt-6">
                    <ApplyForm />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* How it works */}
        <div className="relative border-t border-white/10 bg-white/[0.03]">
          <div className="mx-auto container px-6 py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
              <p className="mt-3 text-white/60">
                From application to your first payout — three simple steps.
              </p>
            </div>
            <ol className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative text-center sm:text-left">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/15 text-indigo-300 sm:mx-0">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-indigo-300/80">
                    Step {i + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mx-auto container px-6 py-16">
          <div className="relative overflow-hidden rounded-3xl border border-brand-primary/30 bg-gradient-to-br from-brand-primary/20 via-transparent to-transparent p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to build your book of business?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/70">
              Join the sales organizations and independent reps already earning with PeptSci.
            </p>
            <a
              href="#apply"
              className="mt-8 inline-block rounded-xl bg-brand-primary px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-primary/40 transition-colors hover:bg-brand-primary/90"
            >
              Start your application
            </a>
          </div>
        </div>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex container flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_SRC} alt="PeptSci" className="h-6 w-auto opacity-70" />
          <p className="text-xs text-white/50">
            Questions?{' '}
            <a href="mailto:support@peptsci.com" className="text-white/70 underline-offset-2 hover:text-white hover:underline">
              support@peptsci.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
