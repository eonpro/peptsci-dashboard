import Image from 'next/image'
import Link from 'next/link'
import { BookDisclaimer, BookCopyright } from '../BookDisclaimer'
import {
  CATALOG_YEAR,
  type CatalogBookCategorySummary,
} from '@/lib/catalog-book'

export function BookCoverPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-white px-8 py-10 text-brand-onyx sm:px-12 sm:py-12">
      <div className="flex flex-1 flex-col justify-center gap-10 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex justify-center lg:flex-1">
          <Image
            src="/brand/peptsci-icon-transparent.png"
            alt=""
            width={420}
            height={420}
            className="h-auto w-56 sm:w-72 lg:w-[22rem]"
            priority
          />
        </div>
        <div className="lg:flex-1">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/peptsci-icon-transparent.png"
              alt=""
              width={48}
              height={48}
              className="h-10 w-10"
            />
            <div>
              <p className="text-2xl font-semibold tracking-tight text-brand-onyx sm:text-3xl">
                PeptSci
              </p>
              <p className="text-sm font-medium tracking-wide text-brand-primary">research</p>
            </div>
          </div>
          <div className="mt-8 inline-block rounded-lg bg-brand-primary px-5 py-3">
            <p className="text-lg font-semibold text-white sm:text-xl">
              {CATALOG_YEAR} Research Product Catalog
            </p>
          </div>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.22em] text-brand-primary/70">
            Physician Use Only
          </p>
          <button
            type="button"
            data-book-next
            className="mt-10 inline-flex items-center rounded-full bg-brand-onyx px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-primary"
          >
            Browse catalog
          </button>
        </div>
      </div>
      <footer className="mt-10 space-y-3">
        <BookCopyright light />
        <BookDisclaimer light />
      </footer>
    </div>
  )
}

export function BookAboutPage() {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#080c21] px-8 py-10 text-white sm:px-12 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-brand-primary/15 blur-3xl"
      />
      <div className="relative flex items-center gap-3">
        <Image src="/brand/peptsci-icon-transparent.png" alt="" width={36} height={36} className="h-9 w-9" />
        <div>
          <p className="text-lg font-semibold">PeptSci</p>
          <p className="text-xs tracking-wide text-white/60">research</p>
        </div>
      </div>
      <div className="relative mt-12 max-w-3xl flex-1 space-y-5">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          For Licensed Physicians. For Authorized Research.
        </h2>
        <p className="text-sm leading-relaxed text-white/80 sm:text-[15px]">
          PeptSci Research is a leading provider of high-purity investigational peptides developed
          exclusively for licensed physicians, research laboratories, and scientific institutions.
        </p>
        <p className="text-sm leading-relaxed text-white/80 sm:text-[15px]">
          The company&apos;s mission is to advance biomedical discovery by supplying research-grade
          compounds that support studies in metabolic health, hormone signaling, and cellular
          regeneration.
        </p>
        <p className="text-sm leading-relaxed text-white/80 sm:text-[15px]">
          With a focus on quality, consistency, and integrity, PeptSci Research delivers compounds
          designed to meet the rigorous standards of professional research environments. Every
          formulation undergoes analytical verification for purity, identity, and stability.
        </p>
        <p className="text-sm leading-relaxed text-white/70 sm:text-[15px]">
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
    <div className="flex min-h-full flex-col bg-white px-8 py-10 text-brand-onyx sm:px-12 sm:py-12">
      <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="rounded-3xl bg-[#0b1120] p-8 text-white sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Research Categories</h2>
          <p className="mt-5 text-sm leading-relaxed text-white/75">
            Investigational peptides developed exclusively for laboratory, licensed-physician, and
            pre-clinical research. Categories below reflect compounds we currently offer — not the
            full historical print catalog.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {categories.length === 0 ? (
            <p className="text-sm text-brand-onyx/50">
              Catalog products will appear here once SKUs are published.
            </p>
          ) : (
            categories.map((c) => (
              <button
                key={c.pageId}
                type="button"
                data-book-goto={c.pageId}
                className="group flex items-center justify-between rounded-full border border-brand-primary/40 bg-white px-5 py-3 text-left text-brand-onyx transition-colors hover:bg-brand-primary hover:text-white"
              >
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="text-xs font-medium text-brand-onyx/55 group-hover:text-white/80">
                  {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <footer className="mt-10 space-y-3">
        <BookCopyright light />
        <BookDisclaimer light />
      </footer>
    </div>
  )
}

export function BookShippingPage() {
  return (
    <div className="flex min-h-full flex-col bg-[#f4f5f8] px-8 py-10 text-brand-onyx sm:px-12 sm:py-12">
      <h2 className="text-3xl font-semibold tracking-tight text-brand-onyx sm:text-4xl">
        2-day nationwide <span className="text-brand-primary">shipping</span>
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-black/65">
        Controlled domestic distribution of research-grade materials throughout the United States.
        Complimentary standard delivery on verified institutional orders over $500. Custom
        formulations or large orders may take additional time after quality release.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { title: 'Standard', detail: '3–4 business days in transit after quality release.' },
          { title: '2-Day', detail: '2 business days in transit. Estimated 3–4 days after payment confirmation.' },
          { title: 'Overnight', detail: '1 business day in transit after the order ships.' },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-black/8 bg-white p-5">
            <p className="text-sm font-semibold text-brand-onyx">{item.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-black/60">{item.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-black/50">
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
    <div className="relative flex min-h-full flex-col overflow-hidden bg-brand-primary px-8 py-10 text-white sm:px-12 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.28),transparent_62%)]"
      />
      <div className="relative grid flex-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <span className="inline-flex rounded-full bg-brand-onyx px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
            For qualifying practices
          </span>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            White-label packaging
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
            Custom vial labeling and branded packaging are available for approved practices. Your
            PeptSci representative can confirm eligibility, brand artwork, and minimums for your
            account.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex rounded-full bg-brand-onyx px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            Request an account
          </Link>
        </div>
        <div className="flex justify-center">
          <div className="rounded-3xl bg-white/15 px-10 py-14 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Your brand here</p>
            <p className="mt-3 text-2xl font-semibold">Custom label</p>
            <p className="mt-2 text-sm text-white/75">Vial + packaging</p>
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
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#080c21] px-8 py-10 text-white sm:px-12 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-brand-primary/30 blur-3xl"
      />
      <div className="relative flex flex-1 flex-col justify-center">
        <Image src="/brand/peptsci-icon-transparent.png" alt="" width={56} height={56} className="h-14 w-14" />
        <h2 className="mt-8 text-4xl font-semibold tracking-tight">Ready to order?</h2>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/75">
          Create a practice account to see your rates, place orders, and download certificates of
          analysis. The catalog lists current research SKUs at list price; approved practices receive
          their contracted pricing in the shop.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="inline-flex rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
          >
            Create your account
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/16"
          >
            Log in
          </Link>
        </div>
        <div className="mt-12 space-y-1 text-sm text-white/65">
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
