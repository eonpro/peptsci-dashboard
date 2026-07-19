import { cn } from '@/lib/utils'
import type { ShopProduct } from '@/lib/types/shop'

/**
 * ProductVial — renders the photoreal blank vial with a dynamically generated
 * PeptSci label composited on top, so every product gets a labeled vial shot
 * even without a dedicated 3D render.
 *
 * The blank vial base (public/vial/vial-blank.png) was derived from the
 * official render; the label area occupies a fixed region of the image and is
 * filled with live HTML sized in container-query units so it scales with the
 * vial.
 */

// Label rectangle as % of the cropped vial image (measured from the render)
const LABEL = { left: 1.6, top: 44.4, width: 95.8, height: 43.2 }

export interface VialCompound {
  name: string
  dose: string
}

/** Split a blend product into its component peptides (best effort). */
export function getCompoundParts(product: ShopProduct): VialCompound[] {
  if (product.compounds && product.compounds.length >= 2) {
    return product.compounds.map((c) => ({ name: c.name, dose: c.amount || '' }))
  }

  const looksLikeBlend = /blend|[/+]/i.test(product.name)
  if (looksLikeBlend) {
    const names = product.name
      .replace(/blend/gi, '')
      .split(/\s*[/+]\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length >= 2) {
      const doses = (product.dose || '').split(/\s*[/+]\s*/).map((s) => s.trim())
      return names.map((name, i) => {
        // "BPC-157 5mg" style names carry their own dose
        const inline = name.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|iu))/i)
        return {
          name: name.replace(/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\s*$/i, '').trim(),
          dose: inline?.[1] ?? doses[i] ?? doses[0] ?? '',
        }
      })
    }
  }

  return [
    {
      name: product.name.replace(/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\s*$/i, '').trim(),
      dose: product.dose || (product.milligrams ? `${product.milligrams}mg` : ''),
    },
  ]
}

interface ProductVialProps {
  product: ShopProduct
  className?: string
}

export function ProductVial({ product, className }: ProductVialProps) {
  const compounds = getCompoundParts(product)
  const isBlend = compounds.length >= 2
  const purity = product.compounds?.[0]?.purity || '99%HPLC'
  // Compact purity for the tiny label ("99%+HPLC" style)
  const purityShort = purity.replace(/\s+/g, '').toUpperCase()

  return (
    <div className={cn('relative aspect-400/911 select-none', className)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vial/vial-blank.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* Generated label overlay */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: `${LABEL.left}%`,
          top: `${LABEL.top}%`,
          width: `${LABEL.width}%`,
          height: `${LABEL.height}%`,
          containerType: 'size',
        }}
      >
        <div className="flex h-full w-full items-stretch px-[5cqw] py-[6cqw] text-[#101123]">
          {/* Vertical PeptSci logo */}
          <div className="relative h-full w-[20cqw] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/vial/label-logo-vertical.png"
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
          </div>

          {/* Divider */}
          <div className="mx-[3.5cqw] my-[2cqw] w-[0.6cqw] shrink-0 rounded-full bg-[#2b2c84]/80" />

          {/* Main label content */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[4cqw]">
            {/* Product name */}
            {isBlend ? (
              <div className="leading-[1.05] font-bold tracking-tight">
                <div className="truncate text-[12cqw] text-[#101123]">{compounds[0].name}</div>
                <div className="truncate text-[12cqw]">
                  <span className="mr-[1.5cqw] text-[8cqw] font-semibold text-[#101123]">and</span>
                  <span className="text-brand-primary">{compounds[1].name}</span>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'truncate leading-none font-bold tracking-tight text-[#101123]',
                  compounds[0].name.length > 10 ? 'text-[11cqw]' : 'text-[15cqw]'
                )}
              >
                {compounds[0].name}
              </div>
            )}

            {/* RUO | dose box | purity */}
            <div className="flex items-stretch gap-[2.5cqw]">
              <div className="flex items-center justify-center">
                <span className="text-[6cqw] font-bold tracking-[0.15em] text-[#101123] [writing-mode:vertical-rl] rotate-180">
                  RUO
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[3cqw]">
                {isBlend ? (
                  <>
                    <div className="flex items-center justify-center bg-[#0b0d2b] py-[1.8cqw]">
                      <span className="truncate text-[8.5cqw] font-semibold text-white">
                        {compounds[0].dose}
                      </span>
                    </div>
                    <div className="flex items-center justify-center bg-[#2134d6] py-[1.8cqw]">
                      <span className="truncate text-[8.5cqw] font-semibold text-white">
                        {compounds[1].dose}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center bg-[#0b0d2b] py-[2cqw]">
                      <span className="truncate text-[9cqw] font-semibold text-white">
                        {compounds[0].dose || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-center bg-[#2134d6] py-[1.2cqw]">
                      <span className="truncate text-[6.5cqw] font-semibold text-white">
                        {purityShort}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {isBlend && (
                <div className="flex items-center justify-center">
                  <span className="text-[4.5cqw] font-semibold tracking-tight text-[#101123] [writing-mode:vertical-rl] rotate-180">
                    {purityShort}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
