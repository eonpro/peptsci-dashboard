import { getProductCatalog } from '@/lib/catalog'
import { getSkusWithPublishedCoa } from '@/lib/coa'
import { groupProductsByParent } from '@/lib/types/shop'
import { productsWithPublishedCoa } from '@/lib/shop/portal'
import Link from 'next/link'
import { FileCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ShopCoasPage() {
  const { products: catalog } = await getProductCatalog()
  const coaSkus = await getSkusWithPublishedCoa(catalog.map((p) => p.sku).filter(Boolean))
  const grouped = groupProductsByParent(
    catalog.map((p) => ({ ...p, hasCoa: coaSkus.has(p.sku) }))
  )
  const rows = productsWithPublishedCoa(
    grouped.map((p) => ({
      name: p.name,
      sku: p.sku,
      hasCoa: Boolean(p.hasCoa || p.sizeOptions?.some((s) => coaSkus.has(s.sku))),
    }))
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <FileCheck className="h-7 w-7 text-brand-primary" />
          Certificates of Analysis
        </h1>
        <p className="mt-1 text-white/60">
          Published COAs for the products in your catalog. Open a product to view or print the
          certificate.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/55">
          No published COAs yet. When a lot is posted, it will appear here and on the product page.
        </p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
          {rows.map((row) => (
            <li key={row.sku}>
              <Link
                href={row.href}
                className="flex items-center justify-between gap-4 px-4 py-3 text-white hover:bg-white/5"
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-sm text-white/45">{row.sku}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
