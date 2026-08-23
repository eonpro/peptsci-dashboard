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
  if (count <= 1) return 'grid-cols-1 max-w-md mx-auto'
  if (count === 2) return 'grid-cols-2'
  if (count === 3) return 'grid-cols-2 lg:grid-cols-3'
  if (count === 4) return 'grid-cols-2 lg:grid-cols-4'
  if (count === 6) return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
  return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
}

export function BookCategoryDivider({ page }: { page: CategoryManifestPage }) {
  const label = CATEGORY_BOOK_LABEL[page.bucket]
  const count = page.entries.length
  const vialHeight =
    count === 1
      ? 'h-64 sm:h-80 lg:h-[22rem]'
      : count <= 4
        ? 'h-48 sm:h-60 lg:h-72'
        : 'h-40 sm:h-48 lg:h-56'

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#050722] px-6 py-8 text-white sm:px-10 lg:px-14 xl:px-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(33,60,239,0.22),transparent_70%)]"
      />
      <header className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-brand-primary">
            Research category
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {label}
          </h2>
        </div>
        <p className="max-w-sm text-sm text-white/55">
          {count} currently offered {count === 1 ? 'product' : 'products'} in this chapter.
        </p>
      </header>

      <div className="relative flex flex-1 items-center py-10">
        <div className={`grid w-full items-start justify-items-center gap-x-8 gap-y-12 ${gridClass(count)}`}>
          {page.entries.map(({ pageId, product }, i) => {
            const summary = catalogProductSummary(product)
            const doses = doseList(product)
            return (
              <button
                key={pageId}
                type="button"
                data-book-goto={pageId}
                className="animate-book-fade-up group flex h-full w-full flex-col items-center text-left"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div
                  className={`flex ${vialHeight} w-full items-end justify-center rounded-[1.75rem] bg-white/[0.03] ring-1 ring-white/8 transition-all duration-500 group-hover:bg-white/[0.06] group-hover:ring-brand-primary/40 group-hover:shadow-[0_24px_60px_rgba(33,60,239,0.18)]`}
                >
                  <ProductVial
                    product={product}
                    className={`${vialHeight} w-auto drop-shadow-[0_22px_36px_rgba(0,0,0,0.55)] transition-transform duration-500 ease-out group-hover:scale-[1.06]`}
                  />
                </div>
                <span className="mt-5 flex min-h-[3.5rem] items-start justify-center text-center text-base font-semibold leading-tight tracking-tight text-white transition-colors group-hover:text-brand-primary sm:text-lg">
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
                <span className="mt-3 flex min-h-[3.25rem] w-full flex-wrap content-start justify-center gap-1.5">
                  {doses.map((dose) => (
                    <span
                      key={dose}
                      className="h-fit rounded-full bg-brand-primary px-2.5 py-1 text-[10px] font-semibold text-white sm:text-[11px]"
                    >
                      {dose}
                    </span>
                  ))}
                </span>
                <span className="mt-2 min-h-[1.25rem] text-xs font-semibold tabular-nums text-white/70">
                  {summary.fromPrice
                    ? `List ${summary.fromPrice}${doses.length > 1 ? '+' : ''}`
                    : '\u00a0'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <footer className="relative space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}
