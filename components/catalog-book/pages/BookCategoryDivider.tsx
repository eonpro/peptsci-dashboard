import { ProductVial } from '@/components/shop/ProductVial'
import { BookCopyright, BookDisclaimer } from '../BookDisclaimer'
import { CATEGORY_BOOK_LABEL, type CategoryManifestPage } from '@/lib/catalog-book'

function doseList(product: CategoryManifestPage['entries'][number]['product']): string[] {
  const doses =
    product.availableDoses && product.availableDoses.length > 0
      ? product.availableDoses
      : [product.dose]
  return doses.filter(Boolean)
}

export function BookCategoryDivider({ page }: { page: CategoryManifestPage }) {
  const label = CATEGORY_BOOK_LABEL[page.bucket]
  const count = page.entries.length
  const vialHeight =
    count === 1 ? 'h-64 sm:h-72' : count <= 3 ? 'h-52 sm:h-60' : 'h-44 sm:h-52'

  return (
    <div className="flex min-h-full flex-col bg-[#080c21] px-6 py-8 text-white sm:px-10 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-primary">
        Research category
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{label}</h2>
      <p className="mt-3 max-w-xl text-sm text-white/60">
        {count} currently offered {count === 1 ? 'product' : 'products'} in this category.
      </p>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-10 sm:gap-x-14">
          {page.entries.map(({ pageId, product }) => (
            <button
              key={pageId}
              type="button"
              data-book-goto={pageId}
              className="group flex w-[7.5rem] flex-col items-center sm:w-36"
            >
              <ProductVial
                product={product}
                className={`${vialHeight} w-auto drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:scale-[1.04]`}
              />
              <span className="mt-5 text-center text-sm font-semibold leading-tight tracking-tight text-white transition-colors group-hover:text-brand-primary sm:text-base">
                {product.name}
              </span>
              <span className="mt-2 flex flex-wrap justify-center gap-1">
                {doseList(product).map((dose) => (
                  <span
                    key={dose}
                    className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-white sm:text-[11px]"
                  >
                    {dose}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="space-y-3">
        <BookCopyright />
        <BookDisclaimer />
      </footer>
    </div>
  )
}
