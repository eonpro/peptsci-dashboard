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
  const overview = monograph?.overview?.slice(0, 2) ?? []
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
    <div className="flex min-h-full flex-col bg-white px-6 py-8 text-brand-onyx sm:px-10 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="flex justify-center">
          <div className="flex w-full max-w-[320px] items-center justify-center rounded-3xl bg-brand-primary p-8 sm:p-10">
            <ProductVial
              product={product}
              className="h-64 w-auto drop-shadow-[0_16px_28px_rgba(0,0,0,0.35)] sm:h-72"
            />
          </div>
        </div>

        <div>
          <span className="inline-flex rounded-full bg-brand-onyx px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            {categoryLabel}
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-brand-onyx sm:text-4xl">
            {product.name}
          </h2>
          {product.aka && (
            <p className="mt-1 text-sm text-black/50">{product.aka}</p>
          )}
          <div className="mt-5 space-y-3">
            {description.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="text-sm leading-relaxed text-black/70">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>

      {isBlend && product.compounds && product.compounds.length >= 2 ? (
        <section className="mt-10">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-onyx">
            {trade ? 'Blend composition' : 'Compounds'}
          </h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-black/8">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-brand-onyx text-white">
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Peptide</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Amount</th>
                  <th className="hidden px-4 py-3 text-[11px] font-bold uppercase tracking-wider sm:table-cell">
                    CAS
                  </th>
                  <th className="hidden px-4 py-3 text-[11px] font-bold uppercase tracking-wider md:table-cell">
                    Formula
                  </th>
                </tr>
              </thead>
              <tbody>
                {product.compounds.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f6f2]'}>
                    <td className="px-4 py-3 text-sm font-semibold text-brand-onyx">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-black/70">{c.amount || '—'}</td>
                    <td className="hidden px-4 py-3 text-sm text-black/70 sm:table-cell">
                      {c.casNumber || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-black/70 md:table-cell">
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
            <div key={spec.label} className="rounded-2xl border border-black/8 bg-[#f7f6f2] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-black/45">
                {spec.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-brand-onyx">{spec.value}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-wider text-brand-onyx">
          Available dosage strengths
        </h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-black/8">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-brand-onyx text-white">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Strength</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider">
                  List price
                </th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((size, i) => (
                <tr key={size.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f7f6f2]'}>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white">
                      {size.dose || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-black/70">{size.sku}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-brand-onyx">
                    {formatListPrice(size.displayPrice) ?? 'Contact for pricing'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-black/50">
          List price per vial. Practice and volume pricing are applied after your account is
          approved. Sign in to order currently offered SKUs.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-flex rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Sign in to order
        </Link>
      </section>

      <footer className="mt-auto space-y-3 pt-10">
        <BookCopyright light />
        <BookDisclaimer light />
      </footer>
    </div>
  )
}
