import { getProductCatalog } from '@/lib/catalog'
import { groupProductsByParent } from '@/lib/types/shop'
import { CatalogBook } from '@/components/catalog-book/CatalogBook'
import { buildBookPages } from '@/components/catalog-book/buildBookPages'

export const dynamic = 'force-dynamic'

/**
 * Public, shareable visual catalog. SKUs and list prices come from the live
 * ACTIVE shop catalog — the same products clinics see on the client side.
 * Client-specific rates are not shown here.
 */
export default async function CatalogPage() {
  const { products } = await getProductCatalog()
  const grouped = groupProductsByParent(products)
  const { meta, nodes } = buildBookPages(grouped)
  return <CatalogBook pages={meta}>{nodes}</CatalogBook>
}
