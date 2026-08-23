import Image from 'next/image'
import Link from 'next/link'
import { BookDisclaimer, BookCopyright } from '../BookDisclaimer'
import {
  CATALOG_YEAR,
  type CatalogBookCategorySummary,
} from '@/lib/catalog-book'

export function BookCoverPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#050722] px-8 py-10 text-white sm:px-12 lg:px-16 xl:px-24">
      <div
        aria-hidden
        className="animate-book-orb pointer-events-none absolute -left-24 top-[-20%] h-[28rem] w-[28rem] rounded-full bg-brand-primary/35 blur-[90px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-[-10%] h-[32rem] w-[32rem] rounded-full bg-brand-primary/20 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]"
      />

      <div className="relative flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
        <div className="animate-book-fade-up flex justify-center lg:w-[46%]">
          <Image
            src="/brand/peptsci-icon-transparent.png"
            alt=""
            width={560}
            height={560}
            className="h-auto w-64 drop-shadow-[0_30px_80px_rgba(33,60,239,0.45)] sm:w-80 lg:w-[28rem]"
            priority
          />
        </div>
        <div className="lg:w-[54%]">
          <p
            className="animate-book-fade-up text-[11px] font-semibold uppercase tracking-[0.42em] text-white/50"
            style={{ animationDelay: '80ms' }}
          >
            Physician use only
          </p>
          <div className="mt-5 flex items-center gap-3">
            <Image
              src="/brand/peptsci-icon-transparent.png"
              alt=""
              width={48}
              height={48}
              className="h-10 w-10"
            />
            <div>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">PeptSci</p>
              <p className="text-sm font-medium tracking-[0.22em] text-brand-primary">research</p>
            </div>
          </div>
          <h1
            className="animate-book-fade-up mt-8 max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            style={{ animationDelay: '140ms' }}
          >
            {CATALOG_YEAR}
            <span className="mt-2 block text-2xl font-semibold text-white/80 sm:text-3xl lg:text-4xl">
              Research product catalog
            </span>
          </h1>
          <p
            className="animate-book-fade-up mt-6 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base"
            style={{ animationDelay: '200ms' }}
          >
            Currently offered investigational peptides for licensed physicians and research
            laboratories. List prices; practice rates after approval.
          </p>
          <button
            type="button"
            data-book-next
            className="animate-book-fade-up mt-10 inline-flex items-center gap-3 rounded-full bg-brand-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(33,60,239,0.4)] transition-all hover:brightness-110 active:scale-95"
            style={{ animationDelay: '280ms' }}
          >
            Browse catalog
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7.3 15.7a1 1 0 0 1 0-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 1.42-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      <footer className="relative mt-10 space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}

export function BookAboutPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#050722] px-8 py-10 text-white sm:px-12 lg:px-16 xl:px-24">
      <div
        aria-hidden
        className="animate-book-orb pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand-primary/25 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-brand-primary/12 blur-[90px]"
      />
      <div className="relative flex items-center gap-3">
        <Image src="/brand/peptsci-icon-transparent.png" alt="" width={36} height={36} className="h-9 w-9" />
        <div>
          <p className="text-lg font-semibold">PeptSci</p>
          <p className="text-xs tracking-[0.2em] text-white/55">research</p>
        </div>
      </div>
      <div className="relative mt-12 grid flex-1 gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div className="max-w-3xl space-y-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-primary">
            The house
          </p>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            For licensed physicians.
            <span className="mt-2 block text-white/70">For authorized research.</span>
          </h2>
          <p className="text-base leading-relaxed text-white/80 sm:text-lg">
            PeptSci Research is a leading provider of high-purity investigational peptides developed
            exclusively for licensed physicians, research laboratories, and scientific institutions.
          </p>
          <p className="text-sm leading-relaxed text-white/70 sm:text-[15px]">
            The company&apos;s mission is to advance biomedical discovery by supplying research-grade
            compounds that support studies in metabolic health, hormone signaling, and cellular
            regeneration.
          </p>
          <p className="text-sm leading-relaxed text-white/70 sm:text-[15px]">
            With a focus on quality, consistency, and integrity, PeptSci Research delivers compounds
            designed to meet the rigorous standards of professional research environments. Every
            formulation undergoes analytical verification for purity, identity, and stability.
          </p>
        </div>
        <p className="max-w-md border-l border-white/15 pl-6 text-sm leading-relaxed text-white/55">
          PeptSci Research is not a compounding pharmacy or chemical compounding facility as defined
          under Section 503A of the FD&amp;C Act. It is also not an outsourcing facility as defined
          under Section 503B of the FD&amp;C Act. All products are intended solely for laboratory
          and research use by licensed professionals and are not for human or veterinary use.
        </p>
      </div>
      <footer className="relative mt-10">
        <BookCopyright />
      </footer>
    </div>
  )
}

export function BookCategoriesPage({
  categories,
}: {
  categories: CatalogBookCategorySummary[]
}) {
  return (
    <div className="flex min-h-full flex-col bg-[#050722] px-8 py-10 text-white sm:px-12 lg:px-16 xl:px-24">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-primary">
          Index
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Research categories
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
          Investigational peptides developed exclusively for laboratory, licensed-physician, and
          pre-clinical research. Categories below reflect compounds we currently offer — not the
          full historical print catalog.
        </p>
      </div>
      <div className="mt-10 grid flex-1 auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.length === 0 ? (
          <p className="text-sm text-white/50">
            Catalog products will appear here once SKUs are published.
          </p>
        ) : (
          categories.map((c, i) => (
            <button
              key={c.pageId}
              type="button"
              data-book-goto={c.pageId}
              className="animate-book-fade-up group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-left transition-all duration-300 hover:-translate-y-1 hover:border-brand-primary/50 hover:bg-white/[0.08]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand-primary/0 blur-2xl transition-all duration-500 group-hover:bg-brand-primary/30"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
                {String(i + 1).padStart(2, '0')}
              </p>
              <p className="mt-6 text-2xl font-semibold tracking-tight transition-colors group-hover:text-white sm:text-3xl">
                {c.label}
              </p>
              <p className="mt-3 text-sm text-white/50">
                {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
              </p>
              <span className="mt-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">
                Open chapter
                <svg className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M7.3 15.7a1 1 0 0 1 0-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 1.42-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </button>
          ))
        )}
      </div>
      <footer className="mt-10 space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}

export function BookShippingPage() {
  return (
    <div className="flex min-h-full flex-col bg-[#f4f5f8] px-8 py-10 text-brand-onyx sm:px-12 lg:px-16 xl:px-24">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-primary">
            Fulfillment
          </p>
          <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            2-day nationwide <span className="text-brand-primary">shipping</span>
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-black/60 sm:text-base">
            Controlled domestic distribution of research-grade materials throughout the United
            States. Complimentary standard delivery on verified institutional orders over $500.
            Custom formulations or large orders may take additional time after quality release.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/catalog/shipping-bags.jpg"
          alt="PeptSci discreet black and branded white shipping mailers"
          draggable={false}
          className="animate-book-fade-up hidden w-full rounded-3xl border border-black/6 object-cover shadow-[0_20px_50px_rgba(5,7,34,0.08)] lg:block"
        />
      </div>
      <div className="mt-12 grid flex-1 gap-5 sm:grid-cols-3">
        {[
          { title: 'Standard', detail: '3–4 business days in transit after quality release.' },
          { title: '2-Day', detail: '2 business days in transit. Estimated 3–4 days after payment confirmation.' },
          { title: 'Overnight', detail: '1 business day in transit after the order ships.' },
        ].map((item, i) => (
          <div
            key={item.title}
            className="animate-book-fade-up rounded-3xl border border-black/6 bg-white p-8 shadow-[0_20px_50px_rgba(5,7,34,0.06)]"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">
              {String(i + 1).padStart(2, '0')}
            </p>
            <p className="mt-4 text-2xl font-semibold text-brand-onyx">{item.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-black/55">{item.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs leading-relaxed text-black/50">
        Processing is typically 1–2 business days before carrier transit begins. PeptSci does not
        currently ship internationally. See the full shipping policy for temperature-control and
        research-transport requirements.
      </p>
      <Link
        href="/shipping"
        className="mt-4 text-sm font-semibold text-brand-primary hover:underline"
      >
        Read the shipping policy
      </Link>
      <footer className="mt-auto space-y-3 pt-10">
        <BookCopyright light />
        <BookDisclaimer light />
      </footer>
    </div>
  )
}

export function BookWhiteLabelPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-brand-primary px-8 py-10 text-white sm:px-12 lg:px-16 xl:px-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.28),transparent_58%)]"
      />
      <div className="relative grid flex-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="inline-flex rounded-full bg-brand-onyx px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]">
            For qualifying practices
          </span>
          <h2 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            White-label packaging
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85">
            Custom vial labeling and branded packaging are available for approved practices. Your
            PeptSci representative can confirm eligibility, brand artwork, and minimums for your
            account.
          </p>
          <Link
            href="/sign-up"
            className="mt-10 inline-flex rounded-full bg-brand-onyx px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-black active:scale-95"
          >
            Request an account
          </Link>
        </div>
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md rounded-[2rem] bg-white/12 px-12 py-16 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Your brand here</p>
            <p className="mt-4 text-4xl font-semibold">Custom label</p>
            <p className="mt-3 text-sm text-white/75">Vial + packaging</p>
          </div>
        </div>
      </div>
      <footer className="relative mt-10 space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}

export function BookBackPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#050722] px-8 py-10 text-white sm:px-12 lg:px-16 xl:px-24">
      <div
        aria-hidden
        className="animate-book-orb pointer-events-none absolute -right-20 top-10 h-[28rem] w-[28rem] rounded-full bg-brand-primary/30 blur-[100px]"
      />
      <div className="relative flex flex-1 flex-col justify-center">
        <Image src="/brand/peptsci-icon-transparent.png" alt="" width={72} height={72} className="h-16 w-16" />
        <h2 className="mt-10 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          Ready to order?
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">
          Create a practice account to see your rates, place orders, and download certificates of
          analysis. The catalog lists current research SKUs at list price; approved practices receive
          their contracted pricing in the shop.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="inline-flex rounded-full bg-brand-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(33,60,239,0.4)] hover:brightness-110"
          >
            Create your account
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full border border-white/15 bg-white/8 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/14"
          >
            Log in
          </Link>
        </div>
        <div className="mt-16 space-y-1 text-sm text-white/60">
          <p className="font-semibold text-white">PeptSci</p>
          <p>401 Jackson St Suite 2340-K23</p>
          <p>Tampa, FL 33602</p>
          <p>
            <a className="hover:text-white" href="mailto:support@peptsci.com">
              support@peptsci.com
            </a>
          </p>
        </div>
      </div>
      <footer className="relative mt-10 space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}
