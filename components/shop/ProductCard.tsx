'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { ShopProduct } from '@/lib/types/shop'
import { useOptionalCart } from './CartContext'
import { cn } from '@/lib/utils'
import { ChevronRight, FileText, Pencil } from 'lucide-react'
import { ProductVial, getCompoundParts } from './ProductVial'
import { CoaDialog } from './CoaDialog'
import { resolveNamedBlendTradeName } from '@/lib/products/named-blends'

/** Per-SKU cost/SRP for Super Admin pricing cards (never sent to shop clients). */
export interface AdminPricingSku {
  sku: string
  cost: number
  srp: number
  id?: string
}

export interface ProductCardAdminPricing {
  /** Cost/SRP rows for this compound's sizes (matched by sku). */
  skus: AdminPricingSku[]
  /** Open the Cost/SRP editor for a given sku (or primary when omitted). */
  onEdit: (sku: string) => void
}

interface ProductCardProps {
  product: ShopProduct
  viewMode?: 'grid' | 'list'
  /** Super Admin /pricing mode — same card chrome, Cost/SRP/margin + Edit. */
  adminPricing?: ProductCardAdminPricing
}

// PeptSci Logo - using actual logo image
const PEPTSCI_LOGO_URL = 'https://static.wixstatic.com/media/c49a9b_a7d9e44fe804486b95fd734d0e3bea8e~mv2.png'

// Format molecular formula with subscripts
function formatMolecularFormula(formula: string | null | undefined): JSX.Element | null {
  if (!formula) return null

  // Replace numbers with subscript elements
  const parts = formula.split(/(\d+)/)
  return (
    <span>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <sub key={i} className="text-[0.7em]">
            {part}
          </sub>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

/**
 * Catalog card: one card per compound. Shop mode links to the PDP for size
 * selection / cart. Admin pricing mode keeps the same chrome but surfaces
 * Cost/SRP/margin and an Edit action (no cart / no PDP navigation).
 */
export function ProductCard({ product, viewMode = 'grid', adminPricing }: ProductCardProps) {
  const { items } = useOptionalCart()
  const [coaOpen, setCoaOpen] = useState(false)
  const isAdmin = Boolean(adminPricing)

  const productId = product.sku || product.id
  const pdpHref = `/shop/product/${encodeURIComponent(productId)}`

  // All purchasable sizes (grouped catalog) — falls back to the single variant.
  const sizes =
    product.sizeOptions && product.sizeOptions.length > 0
      ? product.sizeOptions
      : [
          {
            sku: productId,
            dose: product.dose,
            displayPrice: product.displayPrice,
            standardPrice: product.standardPrice,
            isCustomPrice: product.isCustomPrice,
            inStock: product.inStock,
          },
        ]

  // Units of any size of this compound already in the cart.
  const sizeSkus = new Set(sizes.map((s) => s.sku))
  const cartQty = items
    .filter((item) => sizeSkus.has(item.id))
    .reduce((sum, item) => sum + item.quantity, 0)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  // "From $X" — cheapest priced size (client pricing already applied).
  const pricedSizes = sizes.filter((s) => s.displayPrice > 0)
  const unpriced = pricedSizes.length === 0
  const fromPrice = unpriced ? 0 : Math.min(...pricedSizes.map((s) => s.displayPrice))
  const distinctPrices = new Set(pricedSizes.map((s) => s.displayPrice))
  const showFromLabel = sizes.length > 1 && distinctPrices.size > 1
  const cheapest = pricedSizes.find((s) => s.displayPrice === fromPrice)

  // Quantified account savings vs standard price (only when there is a real discount)
  const savingsAmount =
    cheapest?.isCustomPrice &&
    cheapest.standardPrice &&
    cheapest.standardPrice > cheapest.displayPrice &&
    cheapest.displayPrice > 0
      ? cheapest.standardPrice - cheapest.displayPrice
      : 0
  const savingsPercent =
    savingsAmount > 0 && cheapest?.standardPrice
      ? Math.round((savingsAmount / cheapest.standardPrice) * 100)
      : 0

  const outOfStock = product.inStock === false

  // Compound breakdown drives both the card copy and the generated vial label
  const compounds = getCompoundParts(product)
  const isBlend = compounds.length >= 2
  const tradeName = resolveNamedBlendTradeName(product.name)

  // Sizes line ("5mg · 10mg") — grouped doses when available
  const doseList =
    product.availableDoses && product.availableDoses.length > 0
      ? product.availableDoses
      : sizes.map((s) => s.dose).filter(Boolean)
  const doseDisplay =
    doseList.join(' · ') ||
    product.dose ||
    (product.milligrams ? `${product.milligrams}mg` : '') ||
    `${product.name.match(/\d+mg/)?.[0] || ''}`

  // Total mg for the blend callout ("Total 10mg (Blend)")
  const totalMg =
    product.totalAmount ||
    (() => {
      const mgs = compounds
        .map((c) => parseFloat(c.dose))
        .filter((n) => !Number.isNaN(n))
      return mgs.length === compounds.length && mgs.length > 0
        ? `${mgs.reduce((a, b) => a + b, 0)}mg`
        : null
    })() ||
    product.dose ||
    (product.milligrams ? `${product.milligrams}mg` : null)

  const purityDisplay = product.purity || product.compounds?.[0]?.purity || '99%'
  const hasSciSpecs = !!(product.casNumber || product.molecularFormula || product.molecularWeight)

  // Admin: match size pills to Cost/SRP rows (by dose, then sku fallback)
  const adminSkus = adminPricing?.skus ?? []
  const adminByDose = new Map<string, AdminPricingSku>()
  for (const s of sizes) {
    const row = adminSkus.find((a) => a.sku === s.sku)
    if (row && s.dose) adminByDose.set(s.dose, row)
  }
  const adminPrimary =
    adminSkus.find((a) => a.sku === productId) ||
    adminSkus.slice().sort((a, b) => a.srp - b.srp)[0] ||
    null
  const adminCosts = adminSkus.map((a) => a.cost).filter((c) => c > 0)
  const adminSrps = adminSkus.map((a) => a.srp).filter((s) => s > 0)
  const adminFromSrp = adminSrps.length ? Math.min(...adminSrps) : fromPrice
  const adminPricedRows = adminSkus.filter((a) => a.srp > 0)
  const adminAvgMargin =
    adminPricedRows.length > 0
      ? adminPricedRows.reduce((acc, a) => acc + ((a.srp - a.cost) / a.srp) * 100, 0) /
        adminPricedRows.length
      : 0
  const resolveAdminSkuForDose = (dose: string): string => {
    const byDose = adminByDose.get(dose)
    if (byDose) return byDose.sku
    const size = sizes.find((s) => s.dose === dose)
    return size?.sku || adminPrimary?.sku || productId
  }

  // Compact dose pills — admin: click opens Cost/SRP editor for that size
  const renderSizePills = () => (
    <div className="flex flex-wrap items-center gap-1.5">
      {doseList.slice(0, 4).map((dose) =>
        isAdmin && adminPricing ? (
          <button
            key={dose}
            type="button"
            onClick={() => adminPricing.onEdit(resolveAdminSkuForDose(dose))}
            className="relative z-10 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/75 transition-colors hover:border-blue-400/50 hover:text-white"
          >
            {dose}
          </button>
        ) : (
          <span
            key={dose}
            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/75"
          >
            {dose}
          </span>
        )
      )}
      {doseList.length > 4 && (
        <span className="text-[11px] font-medium text-white/45">+{doseList.length - 4}</span>
      )}
    </div>
  )

  const priceBlock = isAdmin ? (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        {adminSkus.length > 1 && adminSrps.length > 1 && new Set(adminSrps).size > 1 && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-white/45">
            From
          </span>
        )}
        <p className="text-xl font-bold text-white">
          {adminSrps.length === 0 ? '—' : formatPrice(adminFromSrp)}
        </p>
      </div>
      <p className="text-[11px] text-white/55">
        Cost{' '}
        <span className="font-semibold text-white/80">
          {adminCosts.length === 0
            ? '—'
            : formatPrice(Math.min(...adminCosts))}
        </span>
        {Number.isFinite(adminAvgMargin) && adminSrps.length > 0 && (
          <>
            {' '}
            · Margin{' '}
            <span
              className={cn(
                'font-semibold',
                adminAvgMargin >= 70
                  ? 'text-green-400'
                  : adminAvgMargin >= 50
                    ? 'text-amber-300'
                    : 'text-red-400'
              )}
            >
              {adminAvgMargin.toFixed(0)}%
            </span>
          </>
        )}
      </p>
    </div>
  ) : (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        {showFromLabel && !unpriced && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-white/45">
            From
          </span>
        )}
        <p className="text-xl font-bold text-white">
          {unpriced ? '—' : formatPrice(fromPrice)}
        </p>
        {cheapest?.isCustomPrice && cheapest.standardPrice && savingsAmount > 0 && (
          <span className="text-sm text-white/40 line-through">
            {formatPrice(cheapest.standardPrice)}
          </span>
        )}
      </div>
      {savingsAmount > 0 && (
        <p className="text-[11px] font-semibold text-green-400">
          Practice rate &middot; Save {savingsPercent}%
        </p>
      )}
    </div>
  )

  // Mobile-optimized list view
  if (viewMode === 'list') {
    return (
      <div className="relative bg-linear-to-br from-[#0a0e3a] to-brand-onyx border border-white/10 rounded-2xl p-4 transition-all active:scale-[0.98] hover:border-blue-400/50 hover:bg-white/[0.02] hover:shadow-lg hover:shadow-blue-500/15">
        <div className="flex items-center gap-4">
          {/* Vial thumbnail (generated label) */}
          <div className="h-16 w-14 shrink-0 flex items-center justify-center">
            <ProductVial
              product={product}
              className="h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
            />
          </div>

          {/* Compact info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-blue-400 text-xs font-medium">
                {isBlend ? 'Blend' : 'Single'}
              </span>
              {product.category && (
                <span className="text-white/40 text-xs">• {product.category}</span>
              )}
            </div>
            <h3 className="font-semibold tracking-tight text-white text-lg leading-tight truncate">
              {isAdmin && adminPricing ? (
                <button
                  type="button"
                  onClick={() => adminPricing.onEdit(adminPrimary?.sku || productId)}
                  className="relative z-10 text-left hover:text-blue-300 transition-colors"
                >
                  {product.name}
                </button>
              ) : (
                <Link
                  href={pdpHref}
                  className="hover:text-blue-300 transition-colors after:absolute after:inset-0 after:content-['']"
                >
                  {product.name}
                </Link>
              )}
            </h3>
            <p className="text-white/60 text-sm truncate">{doseDisplay}</p>
            {outOfStock && (
              <p className="text-amber-400/80 text-xs mt-1">
                Sold Out · backorder available
              </p>
            )}
          </div>

          {/* Price and chevron */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col items-end">
              {isAdmin ? (
                <>
                  <p className="text-lg font-bold text-white">
                    {adminSrps.length === 0 ? '—' : formatPrice(adminFromSrp)}
                  </p>
                  {Number.isFinite(adminAvgMargin) && adminSrps.length > 0 && (
                    <p className="text-[10px] font-semibold text-white/50">
                      {adminAvgMargin.toFixed(0)}% margin
                    </p>
                  )}
                </>
              ) : (
                <>
                  {showFromLabel && !unpriced && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                      From
                    </span>
                  )}
                  <p className="text-lg font-bold text-white">
                    {unpriced ? 'Call' : formatPrice(fromPrice)}
                  </p>
                  {savingsAmount > 0 && (
                    <p className="text-[10px] font-semibold text-green-400">Save {savingsPercent}%</p>
                  )}
                </>
              )}
            </div>
            {isAdmin && adminPricing ? (
              <button
                type="button"
                onClick={() => adminPricing.onEdit(adminPrimary?.sku || productId)}
                className="relative z-10 rounded-lg border border-white/15 p-2 text-white/60 hover:border-blue-400/50 hover:text-white"
                aria-label={`Edit pricing for ${product.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : (
              <ChevronRight className="h-5 w-5 text-white/40" />
            )}
          </div>
        </div>

        {/* In cart indicator badge */}
        {!isAdmin && cartQty > 0 && (
          <div className="pointer-events-none absolute top-2 right-2 z-10">
            <div className="bg-green-500 text-white text-xs font-bold min-w-6 h-6 px-1 rounded-full flex items-center justify-center shadow-lg">
              {cartQty}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Scientific-style grid card (matches PeptSci reference artwork)
  return (
    <div className="@container group relative bg-linear-to-b from-[#0a1050] via-[#070b38] to-[#04051f] border border-white/10 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-blue-400/50 hover:shadow-xl hover:shadow-blue-500/20 min-h-[440px] h-full flex flex-col">
      {/* Reference artwork panel — a flex column so the COA/PRUO block is
          pushed to the bottom in normal flow and can never overlap the spec
          copy above it. Only the vial is absolutely positioned; every text
          block reserves right padding so nothing runs underneath it. */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Hairline inner border (reference style) */}
        <div className="pointer-events-none absolute inset-2.5 rounded-xl border border-blue-400/30" />

        {/* Header: logo + Blend marker */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-1">
          <Image
            src={PEPTSCI_LOGO_URL}
            alt="PeptSci Research"
            width={120}
            height={40}
            className="h-8 w-auto @[16rem]:h-9"
          />
          {isBlend && (
            <span className="shrink-0 pr-1 text-base @[16rem]:text-lg font-bold text-[#4d6bff]">
              Blend
            </span>
          )}
        </div>

        <div className="px-5 pt-2">
          {isBlend && product.compounds && product.compounds.length >= 2 ? (
            /* Blend layout: named trades (GLOW/KLOW) as the hero, then every peptide */
            <div
              className={cn(
                'pr-14 @[18rem]:pr-16',
                product.compounds.length >= 3 ? 'space-y-1.5' : 'space-y-3'
              )}
            >
              {tradeName ? (
                <h3 className="font-semibold tracking-tight text-[#4d6bff] text-xl @[16rem]:text-2xl leading-tight">
                  {isAdmin ? (
                    <span>{product.name}</span>
                  ) : (
                    <Link
                      href={pdpHref}
                      className="transition-colors group-hover:text-blue-300"
                    >
                      {product.name}
                    </Link>
                  )}
                </h3>
              ) : null}
              {product.compounds.map((c, i) => (
                <div key={`${c.name}-${i}`}>
                  <h3
                    className={cn(
                      'font-semibold tracking-tight text-white leading-tight',
                      product.compounds!.length >= 3
                        ? 'text-sm @[16rem]:text-base'
                        : 'text-base @[16rem]:text-lg'
                    )}
                  >
                    {!tradeName && i === 0 && !isAdmin ? (
                      <Link
                        href={pdpHref}
                        className="transition-colors group-hover:text-blue-300"
                      >
                        {c.name} {c.amount}
                      </Link>
                    ) : (
                      <span
                        className={cn(
                          !isAdmin && !tradeName && i === 0 && 'transition-colors group-hover:text-blue-300'
                        )}
                      >
                        {c.name} {c.amount}
                      </span>
                    )}
                  </h3>
                  <p
                    className={cn(
                      'text-white/70 leading-snug tracking-tight',
                      product.compounds!.length >= 3
                        ? 'text-[10px] @[16rem]:text-[11px]'
                        : 'text-[11px] @[16rem]:text-xs'
                    )}
                  >
                    {c.casNumber && <>CAS #: {c.casNumber}</>}
                    {c.casNumber && c.molecularFormula && <span className="text-white/30"> | </span>}
                    {c.molecularFormula && formatMolecularFormula(c.molecularFormula)}
                  </p>
                  <p
                    className={cn(
                      'text-white/70 leading-snug tracking-tight',
                      product.compounds!.length >= 3
                        ? 'text-[10px] @[16rem]:text-[11px]'
                        : 'text-[11px] @[16rem]:text-xs'
                    )}
                  >
                    {c.molecularWeight && <>MW: {c.molecularWeight}</>}
                    {c.molecularWeight && c.purity && <span className="text-white/30"> | </span>}
                    {c.purity && <>{c.purity} Purity</>}
                  </p>
                </div>
              ))}
              {!tradeName && totalMg && (
                <p className="text-[#4d6bff] font-semibold tracking-tight text-base @[16rem]:text-lg pt-1">
                  Total {totalMg} (Blend)
                </p>
              )}
            </div>
          ) : (
            /* Single-compound layout */
            <>
              <h3 className="font-semibold tracking-tight text-white text-xl @[16rem]:text-2xl leading-tight">
                {isAdmin ? (
                  <span>{isBlend ? product.name : compounds[0]?.name || product.name}</span>
                ) : (
                  <Link
                    href={pdpHref}
                    className="transition-colors group-hover:text-blue-300"
                  >
                    {isBlend ? product.name : compounds[0]?.name || product.name}
                  </Link>
                )}
              </h3>
              {product.category && (
                <p className="mt-0.5 text-[#4d6bff] text-[10px] @[16rem]:text-[11px] font-medium uppercase tracking-tight line-clamp-2">
                  {product.category}
                </p>
              )}

              <div
                className={
                  hasSciSpecs
                    ? 'mt-3 space-y-1 text-[13px] @[16rem]:text-sm tracking-tight text-white/90 pr-20 @[18rem]:pr-24'
                    : 'mt-1.5 space-y-1 text-[13px] @[16rem]:text-sm tracking-tight text-white/90 pr-20 @[18rem]:pr-24'
                }
              >
                {product.casNumber && <p className="truncate">CAS #: {product.casNumber}</p>}
                {product.molecularFormula && (
                  <p className="truncate">Formula: {formatMolecularFormula(product.molecularFormula)}</p>
                )}
                {product.molecularWeight && <p className="truncate">MW: {product.molecularWeight}</p>}
                <p className="truncate">Purity: {purityDisplay}</p>
              </div>

              {isBlend && totalMg && (
                <p className="mt-3 text-[#4d6bff] font-semibold tracking-tight text-base @[16rem]:text-lg">
                  Total {totalMg} (Blend)
                </p>
              )}
            </>
          )}
        </div>

        {/* PRUO disclaimer + COA link — sits at the bottom of the panel in
            normal flow (mt-auto) so long spec copy pushes it down instead of
            colliding with it. Right padding keeps it clear of the vial. */}
        <div className="relative z-10 mt-auto px-5 pb-5 pt-4 pr-24 @[18rem]:pr-28">
          {product.hasCoa && (
            <button
              type="button"
              onClick={() => setCoaOpen(true)}
              className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-[#1a2fd8]/40 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-[#1a2fd8]/70"
            >
              <FileText className="h-3 w-3" /> View COA
            </button>
          )}
          <div className="pointer-events-none flex items-start gap-2">
            <span className="shrink-0 rounded-full border border-white/70 px-1.5 py-0.5 text-[9px] font-bold text-white leading-tight">
              PRUO
            </span>
            <span className="text-[10px] @[16rem]:text-[11px] font-semibold text-white leading-snug">
              Physician Research Use Only
            </span>
          </div>
          <p className="pointer-events-none mt-1 text-[9px] @[16rem]:text-[10px] font-medium text-white/80">
            Not for human or veterinary use.
          </p>
        </div>

        {/* Vial with generated label - fully visible, anchored bottom-right */}
        <div className="absolute bottom-3 right-3 pointer-events-none">
          <ProductVial
            product={product}
            className="h-[144px] @[16rem]:h-[164px] drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)] transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      </div>

      {/* Price + sizes footer — selection happens on the product page */}
      <div className="p-4 pt-3 border-t border-white/10 bg-black/20 space-y-2.5">
        {renderSizePills()}
        <div className="flex items-center justify-between gap-2">
          {priceBlock}
          {isAdmin && adminPricing ? (
            <button
              type="button"
              onClick={() => adminPricing.onEdit(adminPrimary?.sku || productId)}
              className={cn(
                'relative z-10 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white',
                'bg-brand-primary transition-colors hover:bg-[#1a30c0]'
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : outOfStock ? (
            <Link
              href={pdpHref}
              className={cn(
                'relative z-10 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-4 text-sm font-semibold',
                'border border-amber-500/40 bg-amber-500/10 text-amber-200 transition-colors hover:bg-amber-500/20'
              )}
            >
              Backorder
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={pdpHref}
              className={cn(
                'relative z-10 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-4 text-sm font-semibold text-white',
                'bg-brand-primary transition-colors hover:bg-[#1a30c0]'
              )}
            >
              {unpriced ? 'Details' : doseList.length > 1 ? 'Select Size' : 'View'}
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/* In cart indicator badge */}
      {!isAdmin && cartQty > 0 && (
        <div className="pointer-events-none absolute top-3 right-3 z-10">
          <div className="bg-green-500 text-white text-xs font-bold min-w-6 h-6 px-1 rounded-full flex items-center justify-center shadow-lg">
            {cartQty}
          </div>
        </div>
      )}

      {/* Whole-card click target for the PDP. Sits above card content (z-[5])
          but below interactive controls (z-10: COA button). aria-hidden +
          tabIndex=-1 because the product-name link already exposes this
          destination to keyboards and screen readers. */}
      {!isAdmin && (
        <Link
          href={pdpHref}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 z-[5]"
        />
      )}

      {product.hasCoa && (
        <CoaDialog
          sku={productId}
          productName={product.name}
          open={coaOpen}
          onOpenChange={setCoaOpen}
        />
      )}
    </div>
  )
}
