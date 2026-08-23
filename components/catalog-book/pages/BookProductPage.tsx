import Link from 'next/link'
import { ProductVial, getCompoundParts } from '@/components/shop/ProductVial'
import { BookCopyright, BookDisclaimer } from '../BookDisclaimer'
import { CATEGORY_BOOK_LABEL, formatListPrice, offeredSizeOptions } from '@/lib/catalog-book'
import { bucketForProduct } from '@/lib/shop-categories'
import { getMonographForName } from '@/lib/content/peptide-monographs'
import { resolveNamedBlendTradeName } from '@/lib/products/named-blends'
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
  const sizes = offeredSizeOptions(product)
  const compounds = getCompoundParts(product)
  const isBlend = compounds.length >= 2 || product.productType === 'Blend'
  const trade = resolveNamedBlendTradeName(product.name, product.sku)
  const bucket = bucketForProduct(product.category, product.name)
  const categoryLabel = CATEGORY_BOOK_LABEL[bucket]
  const monograph = product.monograph ?? getMonographForName(product.name)
  const overview = monograph?.overview ?? []
  const mechanism = monograph?.mechanismOfAction ?? []
  const observations = monograph?.observations ?? []
  const description =
    overview.length > 0
      ? overview
      : product.description
        ? [product.description]
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
        <ProductVial
          product={product}
          className="animate-book-fade-up relative h-72 w-auto drop-shadow-[0_18px_24px_rgba(0,0,0,0.22)] sm:h-80 lg:h-[28rem]"
        />
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

        {isBlend && product.compounds && product.compounds.length >= 2 ? (
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
          <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'CAS', value: product.casNumber || '—' },
              {
                label: 'Formula',
                value: formatMolecularFormula(product.molecularFormula) ?? '—',
              },
              { label: 'MW', value: product.molecularWeight || '—' },
              { label: 'Purity', value: purity },
            ].map((spec) => (
              <div key={spec.label} className="rounded-2xl border border-black/8 bg-[#f7f6f2] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">
                  {spec.label}
                </p>
                <p className="mt-1.5 truncate text-sm font-semibold text-brand-onyx">{spec.value}</p>
              </div>
            ))}
          </section>
        )}

        {observations.length > 0 && (
          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            {observations.map((obs) => (
              <div key={obs.title} className="rounded-2xl border border-black/8 bg-[#f7f6f2] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">
                  {obs.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-black/70">{obs.detail}</p>
              </div>
            ))}
          </section>
        )}

        <section className="mt-10">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-onyx">
            Available dosage strengths
          </h3>
          <div className="mt-4 overflow-hidden rounded-2xl border border-black/8">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-brand-onyx text-white">
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider">Strength</th>
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
