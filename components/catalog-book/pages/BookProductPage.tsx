import Link from 'next/link'
import { Fingerprint, Hexagon, Scale, ShieldCheck } from 'lucide-react'
import { ProductVial, getCompoundParts } from '@/components/shop/ProductVial'
import { BookCopyright, BookDisclaimer } from '../BookDisclaimer'
import { CATEGORY_BOOK_LABEL, formatListPrice, offeredSizeOptions } from '@/lib/catalog-book'
import { bucketForProduct } from '@/lib/shop-categories'
import { getMonographForName } from '@/lib/content/peptide-monographs'
import { resolveNamedBlendTradeName } from '@/lib/products/named-blends'
import {
  BAC_WATER_CATALOG_BLURB,
  bacWaterCatalogRows,
  omitsPeptideSciSpecs,
} from '@/lib/shop/bac-water'
import type { ShopProduct } from '@/lib/types/shop'

function formatMolecularFormula(formula: string | null | undefined) {
  if (!formula) return null
  const parts = formula.split(/(\d+)/)
  return (
    <span>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <sub key={i} className="text-[0.7em]">
            {part}
          </sub>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

export function BookProductPage({ product }: { product: ShopProduct }) {
  const compounds = getCompoundParts(product)
  const isBlend = compounds.length >= 2 || product.productType === 'Blend'
  const trade = resolveNamedBlendTradeName(product.name, product.sku)
  const bucket = bucketForProduct(product.category, product.name)
  const categoryLabel = CATEGORY_BOOK_LABEL[bucket]
  const isBacWater = omitsPeptideSciSpecs(product.name, product.sku)
  const sizes = isBacWater
    ? bacWaterCatalogRows(offeredSizeOptions(product))
    : offeredSizeOptions(product)
  const monograph = isBacWater ? null : (product.monograph ?? getMonographForName(product.name))
  const overview = monograph?.overview ?? []
  const mechanism = monograph?.mechanismOfAction ?? []
  const observations = monograph?.observations ?? []
  const description =
    overview.length > 0
      ? overview
      : product.description
        ? [product.description]
        : isBacWater
          ? [...BAC_WATER_CATALOG_BLURB]
          : [
              'High-purity investigational peptide supplied for licensed laboratory and physician research use only.',
            ]
  const purity = product.purity || product.compounds?.[0]?.purity || '99%'

  return (
    <div className="flex min-h-full flex-col bg-white text-brand-onyx lg:flex-row">
      <aside className="relative flex min-h-[42vh] items-center justify-center overflow-hidden bg-brand-primary px-8 py-12 lg:sticky lg:top-0 lg:h-[calc(100dvh-7.5rem)] lg:w-[40%] lg:shrink-0 lg:self-start lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_55%)]"
        />
        {isBacWater && sizes.length > 1 ? (
          <div className="animate-book-fade-up relative flex flex-wrap items-end justify-center gap-4 sm:gap-6">
            {sizes.map((size) => (
              <div key={size.sku} className="flex flex-col items-center gap-2">
                <ProductVial
                  product={{ ...product, dose: size.dose, sku: size.sku }}
                  className="relative h-52 w-auto drop-shadow-[0_28px_50px_rgba(0,0,0,0.35)] sm:h-64 lg:h-72"
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  {size.dose}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <ProductVial
            product={product}
            className="animate-book-fade-up relative h-72 w-auto drop-shadow-[0_28px_50px_rgba(0,0,0,0.35)] sm:h-80 lg:h-[28rem]"
          />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-6 py-10 sm:px-10 lg:px-14 xl:px-16">
        <span className="inline-flex w-fit rounded-full bg-brand-onyx px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
          {categoryLabel}
        </span>
        <h2 className="mt-5 text-4xl font-semibold tracking-tight text-brand-onyx sm:text-5xl lg:text-6xl">
          {product.name}
        </h2>
        {product.aka && <p className="mt-2 text-base text-black/45">{product.aka}</p>}

        <div className="mt-7 max-w-3xl space-y-4">
          {description.map((paragraph) => (
            <p key={paragraph.slice(0, 48)} className="text-[15px] leading-relaxed text-black/70">
              {paragraph}
            </p>
          ))}
        </div>
        {monograph?.disclaimer && (
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-black/40">{monograph.disclaimer}</p>
        )}
        {mechanism.length > 0 && (
          <div className="mt-8 max-w-3xl">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-onyx">
              Mechanism (research)
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-black/70">
              {mechanism.map((item) => (
                <li key={item.slice(0, 48)}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {!isBacWater &&
          (isBlend && product.compounds && product.compounds.length >= 2 ? (
          <section className="mt-10">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-onyx">
              {trade ? 'Blend composition' : 'Compounds'}
            </h3>
            <div className="mt-4 overflow-hidden rounded-2xl border border-black/8">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-brand-onyx text-white">
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider">Peptide</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider">Amount</th>
                    <th className="hidden px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider sm:table-cell">
                      CAS
                    </th>
                    <th className="hidden px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider md:table-cell">
                      Formula
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.compounds.map((c, i) => (
                    <tr key={`${c.name}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f6f2]'}>
                      <td className="px-5 py-3.5 text-sm font-semibold text-brand-onyx">{c.name}</td>
                      <td className="px-5 py-3.5 text-sm text-black/70">{c.amount || '—'}</td>
                      <td className="hidden px-5 py-3.5 text-sm text-black/70 sm:table-cell">
                        {c.casNumber || '—'}
                      </td>
                      <td className="hidden px-5 py-3.5 text-sm text-black/70 md:table-cell">
                        {formatMolecularFormula(c.molecularFormula) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-onyx">
              Specifications
            </h3>
            {/* Dark lab-data plate echoing the catalog's navy chapters */}
            <div className="relative mt-4 overflow-hidden rounded-3xl bg-[#050722] shadow-[0_24px_60px_rgba(5,7,34,0.3)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(33,60,239,0.32),transparent_58%)]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-primary/60 to-transparent"
              />
              <div className="relative grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-white/8">
                {[
                  { icon: Fingerprint, label: 'CAS Number', value: product.casNumber || '—' },
                  {
                    icon: Hexagon,
                    label: 'Formula',
                    value: formatMolecularFormula(product.molecularFormula) ?? '—',
                  },
                  { icon: Scale, label: 'Molar Mass', value: product.molecularWeight || '—' },
                  {
                    icon: ShieldCheck,
                    label: 'Purity · HPLC',
                    value: <span className="text-[#8da0ff]">{purity}</span>,
                  },
                ].map((spec) => (
                  <div key={spec.label} className="px-5 py-5 sm:px-6">
                    <div className="flex items-center gap-2 text-white/40">
                      <spec.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
                        {spec.label}
                      </p>
                    </div>
                    <p className="mt-2 break-words text-[15px] font-semibold leading-snug tracking-tight text-white">
                      {spec.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        {observations.length > 0 && (
          <section className="mt-10">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-onyx">
              Research highlights
            </h3>
            <p className="mt-1.5 text-xs text-black/45">
              Reported in preclinical, in-vitro, and early-phase research. Not treatment claims.
            </p>
            {/* Odd counts: the last card spans the row so no orphan gap is left. */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 [&>*:last-child:nth-child(odd)]:sm:col-span-2">
              {observations.map((obs, i) => (
                <div
                  key={obs.title}
                  className="group relative overflow-hidden rounded-3xl border border-black/6 bg-white p-6 shadow-[0_14px_36px_rgba(5,7,34,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-primary/25 hover:shadow-[0_24px_52px_rgba(33,60,239,0.12)]"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-primary/[0.07] blur-2xl transition-colors duration-300 group-hover:bg-brand-primary/[0.14]"
                  />
                  <div className="relative flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-bold tabular-nums text-brand-primary">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-[15px] font-semibold tracking-tight text-brand-onyx">
                      {obs.title}
                    </p>
                  </div>
                  <p className="relative mt-3 text-sm leading-relaxed text-black/60">
                    {obs.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h3
            className={
              isBacWater
                ? 'text-sm font-bold tracking-[0.16em] text-brand-onyx'
                : 'text-sm font-bold uppercase tracking-[0.16em] text-brand-onyx'
            }
          >
            {isBacWater ? 'AVAILABLE mL SIZES' : 'Available dosage strengths'}
          </h3>
          <div className="mt-4 overflow-hidden rounded-2xl border border-black/8">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-brand-onyx text-white">
                  <th
                    className={
                      isBacWater
                        ? 'px-5 py-3.5 text-[11px] font-bold tracking-wider'
                        : 'px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider'
                    }
                  >
                    {isBacWater ? 'mL SIZE' : 'Strength'}
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider">SKU</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider">
                    List price
                  </th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((size, i) => (
                  <tr key={size.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f6f2]'}>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white">
                        {size.dose || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-sm text-black/70">{size.sku}</td>
                    <td className="px-5 py-3.5 text-right text-sm font-bold tabular-nums text-brand-onyx">
                      {formatListPrice(size.displayPrice) ?? 'Contact for pricing'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-black/50">
            List price per vial. Practice and volume pricing are applied after your account is
            approved. Sign in to order currently offered SKUs.
          </p>
          <Link
            href="/sign-in"
            className="mt-5 inline-flex rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-95"
          >
            Sign in to order
          </Link>
        </section>

        <footer className="mt-auto space-y-3 pt-12">
          <BookCopyright light />
          <BookDisclaimer light />
        </footer>
      </div>
    </div>
  )
}
