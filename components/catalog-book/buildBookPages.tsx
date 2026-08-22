import type { ReactNode } from 'react'
import {
  buildCatalogBookManifest,
  catalogBookCategories,
  catalogBookMeta,
  type BookPageMeta,
} from '@/lib/catalog-book'
import type { ShopProduct } from '@/lib/types/shop'
import { BookCategoryDivider } from './pages/BookCategoryDivider'
import { BookProductPage } from './pages/BookProductPage'
import {
  BookAboutPage,
  BookBackPage,
  BookCategoriesPage,
  BookCoverPage,
  BookShippingPage,
  BookWhiteLabelPage,
} from './pages/static'

export function buildBookPages(products: ShopProduct[]): {
  meta: BookPageMeta[]
  nodes: ReactNode[]
} {
  const manifest = buildCatalogBookManifest(products)
  const categories = catalogBookCategories(manifest)
  const meta = catalogBookMeta(manifest)
  const nodes: ReactNode[] = manifest.map((page) => {
    switch (page.kind) {
      case 'static':
        switch (page.staticId) {
          case 'cover':
            return <BookCoverPage key={page.id} />
          case 'about':
            return <BookAboutPage key={page.id} />
          case 'categories':
            return <BookCategoriesPage key={page.id} categories={categories} />
          case 'shipping':
            return <BookShippingPage key={page.id} />
          case 'white-label':
            return <BookWhiteLabelPage key={page.id} />
          case 'back':
            return <BookBackPage key={page.id} />
          default:
            return null
        }
      case 'category':
        return <BookCategoryDivider key={page.id} page={page} />
      case 'product':
        return <BookProductPage key={page.id} product={page.product} />
    }
  })
  return { meta, nodes }
}
