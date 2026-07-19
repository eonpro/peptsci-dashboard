'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Check } from 'lucide-react'

const STATS = [
  { label: 'Third-party tested', sub: 'COA on every lot' },
  { label: 'Fast fulfillment', sub: 'Free 2-day shipping $500+' },
  { label: 'Practice pricing', sub: 'Your rates, applied automatically' },
]

/**
 * Cinematic catalog hero: full-width photographic banner (dark navy + warm
 * glow), oversized light-weight headline, pill CTAs, and a stat row along the
 * bottom edge.
 */
export function CatalogHeroBanner() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#04051f]">
      {/* Photography */}
      <Image
        src="/shop/hero-banner.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-right"
      />
      {/* Legibility scrim — deep navy from the left, clear over the vial */}
      <div className="absolute inset-0 bg-linear-to-r from-[#04051f] via-[#04051f]/80 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-t from-[#04051f]/90 via-transparent to-transparent" />

      {/* Living light: the glow behind the vial breathes and a soft warm
          highlight sways across the liquid, so the still photo reads alive.
          Positions track the vial (image is object-right). Decorative only;
          the global reduced-motion rule freezes both. */}
      <div
        aria-hidden="true"
        className="animate-glow-breathe pointer-events-none absolute right-[6%] top-[18%] hidden h-[64%] w-[26%] rounded-full bg-[radial-gradient(circle,rgba(255,158,64,0.35),transparent_65%)] blur-2xl md:block"
      />
      <div
        aria-hidden="true"
        className="animate-liquid-sway pointer-events-none absolute right-[11%] top-[42%] hidden h-[34%] w-[13%] rounded-[45%] bg-[radial-gradient(ellipse_at_center,rgba(255,190,110,0.5),rgba(255,140,50,0.12)_60%,transparent_75%)] mix-blend-soft-light blur-md md:block"
      />

      <div className="relative flex min-h-[420px] flex-col justify-between p-6 md:min-h-[480px] md:p-10">
        {/* Eyebrow */}
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            COA-verified catalog
          </span>

          <h1 className="mt-4 max-w-xl text-4xl font-light leading-[1.05] tracking-tight text-white md:text-6xl">
            Research peptides,
            <br />
            done right.
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-white/60 md:text-base">
            High-purity lyophilized compounds, third-party tested.{' '}
            <br className="hidden sm:block" />
            <span className="sm:whitespace-nowrap">
              Your practice pricing is applied at checkout.
            </span>
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#catalog-search"
              onClick={(e) => {
                e.preventDefault()
                document
                  .getElementById('catalog-search')
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                document.getElementById('catalog-search')?.focus({ preventScroll: true })
              }}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#04051f] transition-transform hover:scale-[1.02]"
            >
              Browse the catalog
            </a>
            <Link
              href="/shop/orders"
              className="rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              Reorder from history
            </Link>
          </div>
        </div>

        {/* Bottom stat row — a clean vertical stack on phones; clustered left
            with hairline dividers on sm+ like the reference */}
        <div className="mt-10 grid grid-cols-1 gap-4 border-t border-white/10 pt-5 sm:flex sm:flex-wrap sm:items-center sm:gap-y-4">
          {STATS.map((s, i) => (
            <div key={s.label} className="flex items-center">
              {i > 0 && (
                <span aria-hidden="true" className="mx-7 hidden h-9 w-px bg-white/25 sm:block" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="mt-0.5 text-xs text-white/50">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
