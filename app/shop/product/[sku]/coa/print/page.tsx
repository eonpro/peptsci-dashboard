import { notFound } from 'next/navigation'
import { getPublishedCoasBySku } from '@/lib/coa'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import { CoaPrintToolbar } from '@/components/coa/CoaPrintToolbar'

export const dynamic = 'force-dynamic'

/**
 * Print-optimized COA view: renders the certificate(s) and auto-opens the
 * browser print dialog so the client can save a PDF. `?coa=<id>` narrows to a
 * single certificate (the dialog's "Download PDF" passes the active one);
 * without it every published certificate prints, one per page.
 *
 * The visibility trick isolates the certificates from the surrounding shop
 * chrome (nav, footer) in the printed output without fighting the layout.
 */
const PRINT_CSS = `
@page { size: letter; margin: 0.3in; }
@media print {
  body * { visibility: hidden; }
  .coa-print-root, .coa-print-root * { visibility: visible; }
  .coa-print-root { position: absolute; top: 0; left: 0; width: 100%; margin: 0; padding: 0; }
  .coa-print-page { break-inside: avoid; page-break-after: always; }
  .coa-print-page:last-child { page-break-after: auto; }
  .coa-doc .page { box-shadow: none !important; border-radius: 0 !important; }
  .coa-doc .srcbtn { display: none !important; }
  .coa-print-toolbar { display: none !important; }
}
`

interface CoaPrintPageProps {
  params: Promise<{ sku: string }>
  searchParams: Promise<{ coa?: string }>
}

export default async function CoaPrintPage({ params, searchParams }: CoaPrintPageProps) {
  const { sku } = await params
  const { coa: coaId } = await searchParams

  let coas = await getPublishedCoasBySku(sku, (id) => `/api/shop/coa/${id}/file`)
  if (coaId) coas = coas.filter((c) => c.id === coaId)
  if (coas.length === 0) notFound()

  return (
    <div className="coa-print-root pt-14 space-y-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <CoaPrintToolbar />
      {coas.map((coa) => (
        <div key={coa.id} className="coa-print-page">
          <CoaCertificate data={coa} logoSrc="/brand/peptsci-logo-dark.png" />
        </div>
      ))}
    </div>
  )
}
