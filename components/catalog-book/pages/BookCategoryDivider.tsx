import { ProductVial } from '@/components/shop/ProductVial'
import { BookCopyright, BookDisclaimer } from '../BookDisclaimer'
import {
  CATEGORY_BOOK_LABEL,
  catalogProductSummary,
  type CategoryManifestPage,
} from '@/lib/catalog-book'

function doseList(product: CategoryManifestPage['entries'][number]['product']): string[] {
  const doses =
    product.availableDoses && product.availableDoses.length > 0
      ? product.availableDoses
      : [product.dose]
  return doses.filter(Boolean)
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count === 4) return 'grid-cols-2 sm:grid-cols-4'
  if (count >= 5) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
  return 'grid-cols-2 sm:grid-cols-3'
}

export function BookCategoryDivider({ page }: { page: CategoryManifestPage }) {
  const label = CATEGORY_BOOK_LABEL[page.bucket]
  const count = page.entries.length
  const vialHeight =
    count === 1 ? 'h-56 sm:h-64' : count <= 4 ? 'h-44 sm:h-52' : 'h-36 sm:h-44'

  return (
    <div className="flex min-h-full flex-col bg-[#080c21] px-6 py-8 text-white sm:px-10 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">
        Research category
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{label}</h2>
      <p className="mt-3 max-w-xl text-sm text-white/60">
        {count} currently offered {count === 1 ? 'product' : 'products'} in this category.
      </p>

      <div className="flex flex-1 items-start justify-center py-8">
        <div className={`grid w-full max-w-6xl items-start justify-items-center gap-x-6 gap-y-10 ${gridClass(count)}`}>
          {page.entries.map(({ pageId, product }) => {
            const summary = catalogProductSummary(product)
            const doses = doseList(product)
            return (
              <button
                key={pageId}
                type="button"
                data-book-goto={pageId}
                className="group flex h-full w-full max-w-[13.5rem] flex-col items-center text-left"
              >
                {/* Fixed shelf so 1-row vs 2-row dose chips cannot lift the vial. */}
                <div className={`flex ${vialHeight} w-full items-end justify-center`}>
                  <ProductVial
                    product={product}
                    className={`${vialHeight} w-auto drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-[1.04]`}
                  />
                </div>
                <span className="mt-4 flex min-h-[3.5rem] items-start justify-center text-center text-sm font-semibold leading-tight tracking-tight text-white transition-colors group-hover:text-brand-primary sm:text-base">
                  <span className="line-clamp-2">{product.name}</span>
                </span>
                <div className="mt-1 flex min-h-[2.6rem] flex-col items-center justify-start gap-0.5">
                  {summary.aka && (
                    <span className="text-center text-[11px] leading-snug text-white/45">
                      {summary.aka}
                    </span>
                  )}
                  {summary.categoryLine && (
                    <span className="text-center text-[10px] font-medium uppercase tracking-wider text-brand-primary/80">
                      {summary.categoryLine}
                    </span>
                  )}
                  {summary.chemistry && (
                    <span className="text-center text-[11px] leading-snug text-white/55">
                      {summary.chemistry}
                    </span>
                  )}
                </div>
                <span className="mt-2 flex min-h-[3.25rem] w-full flex-wrap content-start justify-center gap-1">
                  {doses.map((dose) => (
                    <span
                      key={dose}
                      className="h-fit rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-white sm:text-[11px]"
                    >
                      {dose}
                    </span>
                  ))}
                </span>
                <span className="mt-2 min-h-[1.25rem] text-[11px] font-semibold tabular-nums text-white/70">
                  {summary.fromPrice
                    ? `List ${summary.fromPrice}${doses.length > 1 ? '+' : ''}`
                    : '\u00a0'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <footer className="space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}
