import type { CoaData } from '@/lib/coa'
import type { CoaBlendContext } from '@/lib/coa-blend'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import { CoaPrintToolbar } from '@/components/coa/CoaPrintToolbar'

/**
 * Shared print chrome for shop and admin COA print views. Visibility CSS
 * isolates the letter pages from surrounding layout chrome.
 */
export const COA_PRINT_CSS = `
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

export function CoaPrintDocument({
  coas,
  blendContextFor,
}: {
  coas: CoaData[]
  blendContextFor?: (coa: CoaData) => CoaBlendContext | null
}) {
  return (
    <div className="coa-print-root min-h-screen space-y-8 bg-[#eceef5] pt-14">
      <style dangerouslySetInnerHTML={{ __html: COA_PRINT_CSS }} />
      <CoaPrintToolbar />
      {coas.map((coa) => (
        <div key={coa.id} className="coa-print-page">
          <CoaCertificate
            data={coa}
            logoSrc="/brand/peptsci-logo-dark.png"
            blendContext={blendContextFor?.(coa) ?? null}
          />
        </div>
      ))}
    </div>
  )
}
