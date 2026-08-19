import { cn } from '@/lib/utils'
import type { CompoundInfo, ShopProduct } from '@/lib/types/shop'
import { resolveNamedBlendTradeName } from '@/lib/products/named-blends'

/**
 * ProductVial — renders the photoreal blank vial with a dynamically generated
 * PeptSci label composited on top, so every product gets a labeled vial shot
 * even without a dedicated 3D render.
 *
 * The blank vial base (public/vial/vial-blank.png) was derived from the
 * official render; the label area occupies a fixed region of the image and is
 * filled with live HTML sized in container-query units so it scales with the
 * vial.
 *
 * Bacteriostatic water uses a dedicated product photo instead of the
 * generated PeptSci peptide label.
 */

// Label rectangle as % of the cropped vial image (measured from the render)
const LABEL = { left: 1.6, top: 44.4, width: 95.8, height: 43.2 }

/** Dedicated catalog photo for bacteriostatic water (not a peptide vial label). */
export const BACTERIOSTATIC_WATER_IMAGE = '/shop/bacteriostatic-water.png'

/** True when this catalog name is bacteriostatic / BAC water. */
export function isBacteriostaticWaterProduct(name: string): boolean {
  const n = (name || '').toLowerCase()
  if (!n.trim()) return false
  if (n.includes('bacteriostatic')) return true
  if (n.includes('bac water') || n.includes('bac-water')) return true
  if (n.includes('bac-h2o') || n.includes('bach2o') || n.includes('bacwater')) return true
  return false
}

/** Override image for products that should not use the generated peptide label. */
export function getProductDisplayImage(name: string): string | null {
  if (isBacteriostaticWaterProduct(name)) return BACTERIOSTATIC_WATER_IMAGE
  return null
}

export interface VialCompound {
  name: string
  dose: string
}

/**
 * Minimal product shape for labeled vial art — full ShopProduct works, but
 * order/cart line items only need name + dose.
 */
export type VialProductInput = Pick<ShopProduct, 'name'> &
  Partial<Pick<ShopProduct, 'dose' | 'milligrams' | 'compounds'>>

/** Split a blend product into its component peptides (best effort). */
export function getCompoundParts(product: VialProductInput): VialCompound[] {
  if (product.compounds && product.compounds.length >= 2) {
    return product.compounds.map((c: CompoundInfo) => ({ name: c.name, dose: c.amount || '' }))
  }

  const looksLikeBlend = /blend|[/+]|\sand\s/i.test(product.name)
  if (looksLikeBlend) {
    const names = product.name
      .replace(/blend/gi, '')
      .split(/\s*[/+]\s*|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length >= 2) {
      // Per-part doses only when the dose string itself is split ("5mg/5mg");
      // a single total dose is NOT copied onto each part.
      const doses = (product.dose || '').split(/\s*[/+]\s*/).map((s) => s.trim())
      const hasPartDoses = doses.length === names.length
      return names.map((name, i) => {
        // "BPC-157 5mg" style names carry their own dose
        const inline = name.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|iu))/i)
        return {
          name: name.replace(/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|iu)\s*$/i, '').trim(),
          dose: inline?.[1] ?? (hasPartDoses ? doses[i] : ''),
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

/** First dose in the black band; remaining slash-doses share the blue band. */
export function vialDoseBands(doses: string[]): { top: string; bottom: string } | null {
  const parts = doses.map((d) => d.trim()).filter(Boolean)
  if (parts.length < 2) return null
  if (parts.length === 2) return { top: parts[0], bottom: parts[1] }
  return { top: parts[0], bottom: parts.slice(1).join('/') }
}

/** Per-peptide amounts for the vial dose box (compounds first, else the dose string). */
export function vialDoseParts(product: VialProductInput, compounds: VialCompound[]): string[] {
  const fromCompounds = compounds.map((c) => c.dose).filter(Boolean)
  if (fromCompounds.length >= 2) return fromCompounds
  const raw =
    fromCompounds[0] || product.dose || (product.milligrams ? `${product.milligrams}mg` : '')
  return raw
    .split(/\s*[/+]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Pull a trailing modifier off a peptide name so it can render on its own
 * line under the main name: "CJC-1295 (no DAC)" → ["CJC-1295", "no DAC"],
 * "CJC-1295 Without DAC" → ["CJC-1295", "Without DAC"].
 */
function splitNameModifier(name: string): [string, string | null] {
  const paren = name.match(/^(.*?)\s*\(([^)]{1,20})\)\s*$/)
  if (paren) return [paren[1].trim(), paren[2].trim()]
  const suffix = name.match(/^(.*?)\s+((?:with|without|no)\s+\S+)$/i)
  if (suffix) return [suffix[1].trim(), suffix[2].trim()]
  return [name, null]
}

// Hard clip for label text — it's artwork, so cut the word, never show "…"
const CLIP = 'overflow-hidden whitespace-nowrap text-clip'

interface ProductVialProps {
  product: VialProductInput
  className?: string
}

export function ProductVial({ product, className }: ProductVialProps) {
  const photo = getProductDisplayImage(product.name)
  if (photo) {
    return (
      <div className={cn('relative aspect-400/911 select-none', className)} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
    )
  }

  const compounds = getCompoundParts(product)
  const trade = resolveNamedBlendTradeName(product.name)
  const isBlend = !trade && compounds.length >= 2
  const bands = vialDoseBands(vialDoseParts(product, compounds))
  const totalDose = product.dose || (product.milligrams ? `${product.milligrams}mg` : '')
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
            {/* Product name — GLOW/KLOW print the trade name, not the first two peptides */}
            {trade ? (
              <div className="leading-none font-bold tracking-tight text-[#101123]">
                <div className={cn(CLIP, 'text-[15cqw]')}>{trade}</div>
              </div>
            ) : isBlend ? (
              (() => {
                const [firstMain, firstMod] = splitNameModifier(compounds[0].name)
                const [secondMain, secondMod] = splitNameModifier(compounds[1].name)
                // Long names shrink so the full word fits instead of clipping
                const firstSize = firstMain.length > 8 ? 'text-[9.5cqw]' : 'text-[12cqw]'
                const secondSize = secondMain.length > 8 ? 'text-[9.5cqw]' : 'text-[12cqw]'
                return (
                  <div className="leading-[1.15] font-bold tracking-tight">
                    <div className={cn(CLIP, firstSize, 'text-[#101123]')}>
                      {firstMain}
                      {firstMod && (
                        <span className="ml-[1.5cqw] align-middle text-[5cqw] font-semibold text-[#101123]/80">
                          {firstMod}
                        </span>
                      )}
                    </div>
                    <div className={cn(CLIP, secondSize)}>
                      <span className="mr-[1.5cqw] text-[8cqw] font-semibold text-[#101123]">
                        and
                      </span>
                      <span className="text-brand-primary">{secondMain}</span>
                      {secondMod && (
                        <span className="ml-[1.5cqw] align-middle text-[5cqw] font-semibold text-[#101123]/80">
                          {secondMod}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()
            ) : (
              (() => {
                const [main, mod] = splitNameModifier(compounds[0].name)
                return (
                  <div className="leading-none font-bold tracking-tight text-[#101123]">
                    <div className={cn(CLIP, main.length > 10 ? 'text-[11cqw]' : 'text-[15cqw]')}>
                      {main}
                    </div>
                    {mod && (
                      <div
                        className={cn(
                          CLIP,
                          'mt-[1.5cqw] text-[7cqw] font-semibold text-[#101123]/80'
                        )}
                      >
                        {mod}
                      </div>
                    )}
                  </div>
                )
              })()
            )}

            {/* RUO | dose box | purity */}
            <div className="flex items-stretch gap-[2.5cqw]">
              <div className="flex items-center justify-center">
                <span className="text-[6cqw] font-bold tracking-[0.15em] text-[#101123] [writing-mode:vertical-rl] rotate-180">
                  RUO
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[3cqw]">
                {bands ? (
                  <>
                    <div className="flex items-center justify-center bg-[#0b0d2b] py-[1.8cqw]">
                      <span className={cn(CLIP, 'text-[8.5cqw] font-semibold text-white')}>
                        {bands.top}
                      </span>
                    </div>
                    <div className="flex items-center justify-center bg-[#2134d6] py-[1.8cqw]">
                      <span
                        className={cn(
                          CLIP,
                          bands.bottom.length > 10 ? 'text-[6.5cqw]' : 'text-[8.5cqw]',
                          'font-semibold text-white'
                        )}
                      >
                        {bands.bottom}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center bg-[#0b0d2b] py-[2cqw]">
                      <span className={cn(CLIP, 'text-[9cqw] font-semibold text-white')}>
                        {(isBlend || trade ? totalDose : compounds[0].dose || totalDose) || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-center bg-[#2134d6] py-[1.2cqw]">
                      <span className={cn(CLIP, 'text-[6.5cqw] font-semibold text-white')}>
                        {purityShort}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {bands && (
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
