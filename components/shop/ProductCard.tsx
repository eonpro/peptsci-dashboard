'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { ShopProduct } from '@/lib/types/shop'
import { Button } from '@/components/ui/button'
import { useCart, MAX_ITEM_QUANTITY } from './CartContext'
import { cn } from '@/lib/utils'
import { ShoppingCart, Check, Minus, Plus } from 'lucide-react'
import { ProductVial, getCompoundParts } from './ProductVial'

interface ProductCardProps {
  product: ShopProduct
  viewMode?: 'grid' | 'list'
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

export function ProductCard({ product, viewMode = 'grid' }: ProductCardProps) {
  const { addItem, items, updateQuantity, openCart } = useCart()
  const [isAdding, setIsAdding] = useState(false)
  const [qty, setQty] = useState(1)

  // Cart lines are keyed by SKU (falling back to id) so every add path —
  // catalog card, PDP, and Buy Again — merges into the same line.
  const productId = product.sku || product.id
  const isInCart = items.some((item) => item.id === productId)
  const cartItem = items.find((item) => item.id === productId)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  // Sellable units (already net of reservations, from the catalog). Checkout
  // hard-rejects oversell, so the card must not let clinics add more than is
  // actually available. Unknown stock (undefined) falls back to the order cap.
  const outOfStock = product.inStock === false
  // No SRP / custom price set — checkout rejects $0 lines, so don't offer Add.
  const unpriced = !(product.displayPrice > 0)
  const maxQty = Math.min(
    MAX_ITEM_QUANTITY,
    typeof product.inventoryOnHand === 'number' && product.inventoryOnHand > 0
      ? product.inventoryOnHand
      : MAX_ITEM_QUANTITY
  )

  const clampQty = (value: number) => Math.min(Math.max(1, value), maxQty)

  const handleQtyInput = (raw: string) => {
    const parsed = parseInt(raw, 10)
    setQty(Number.isNaN(parsed) ? 1 : clampQty(parsed))
  }

  const handleAddToCart = () => {
    setIsAdding(true)
    addItem({
      id: productId,
      productId: product.sku || productId,
      name: product.name,
      dose: product.dose,
      sku: product.sku || 'N/A',
      price: product.displayPrice,
      quantity: qty,
      image: undefined,
    })
    setQty(1)

    setTimeout(() => {
      setIsAdding(false)
    }, 600)
  }

  // Compact stepper used before the item is in the cart.
  // size="lg" is used in the grid card footer for a bigger touch target.
  const renderQtyStepper = (size: 'sm' | 'lg' = 'sm') => (
    <div
      className={cn(
        'flex shrink-0 items-center rounded-xl border border-white/15 bg-white/5',
        size === 'lg' ? 'h-10' : 'h-8'
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => setQty((q) => clampQty(q - 1))}
        disabled={qty <= 1}
        className={cn(
          'flex h-full items-center justify-center text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed',
          size === 'lg' ? 'w-8' : 'w-7'
        )}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={maxQty}
        value={qty}
        aria-label="Quantity"
        onChange={(e) => handleQtyInput(e.target.value)}
        onFocus={(e) => e.target.select()}
        className={cn(
          'h-full bg-transparent text-center text-sm font-semibold text-white outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          size === 'lg' ? 'w-9' : 'w-10'
        )}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => setQty((q) => clampQty(q + 1))}
        disabled={qty >= maxQty}
        className={cn(
          'flex h-full items-center justify-center text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed',
          size === 'lg' ? 'w-8' : 'w-7'
        )}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )

  // Inline cart controls once the item is in the cart.
  // fullWidth stretches the control to fill the card footer (grid view).
  const renderInCartControls = (fullWidth = false) =>
    cartItem && (
      <div
        className={cn(
          'flex items-center rounded-xl border border-green-500/50 bg-green-500/10',
          fullWidth ? 'w-full justify-between h-10' : 'h-8'
        )}
      >
        <button
          type="button"
          aria-label="Decrease quantity in cart"
          onClick={() => updateQuantity(productId, cartItem.quantity - 1)}
          className={cn(
            'flex h-full items-center justify-center text-green-400 hover:text-green-300',
            fullWidth ? 'w-10' : 'w-7'
          )}
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={openCart}
          className={cn(
            'h-full truncate px-1 text-center text-sm font-semibold text-green-400',
            fullWidth ? 'flex-1' : 'min-w-8'
          )}
          title="View cart"
        >
          {cartItem.quantity} in cart
        </button>
        <button
          type="button"
          aria-label="Increase quantity in cart"
          onClick={() => updateQuantity(productId, cartItem.quantity + 1)}
          disabled={cartItem.quantity >= maxQty}
          className={cn(
            'flex h-full items-center justify-center text-green-400 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed',
            fullWidth ? 'w-10' : 'w-7'
          )}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    )

  // Compound breakdown drives both the card copy and the generated vial label
  const compounds = getCompoundParts(product)
  const isBlend = compounds.length >= 2

  // Parse dose from product - try multiple sources
  const doseDisplay = product.dose 
    || (product.milligrams ? `${product.milligrams}mg` : '')
    || `${product.name.match(/\d+mg/)?.[0] || ''}`

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

  const purityDisplay = product.compounds?.[0]?.purity || '99%'

  // Mobile-optimized list view
  if (viewMode === 'list') {
    return (
      <div className="bg-linear-to-br from-[#0a0e3a] to-brand-onyx border border-white/10 rounded-2xl p-4 transition-all active:scale-[0.98]">
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
              <Link
                href={`/shop/product/${encodeURIComponent(product.sku || product.id)}`}
                className="hover:text-blue-300 transition-colors"
              >
                {product.name}
              </Link>
            </h3>
            <p className="text-white/60 text-sm">{doseDisplay}</p>
            {product.casNumber && (
              <p className="text-white/40 text-xs mt-1">CAS: {product.casNumber}</p>
            )}
          </div>

          {/* Price and action */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-baseline gap-2">
              {product.isCustomPrice && product.standardPrice && (
                <span className="text-sm text-white/40 line-through">
                  {formatPrice(product.standardPrice)}
                </span>
              )}
              <p className="text-xl font-bold text-white">
                {unpriced ? '—' : formatPrice(product.displayPrice)}
              </p>
            </div>
            {isInCart ? (
              renderInCartControls()
            ) : outOfStock || unpriced ? (
              <span className="text-xs font-medium text-white/40 border border-white/10 rounded-xl px-3 py-2">
                {unpriced ? 'Call for Pricing' : 'Out of Stock'}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                {renderQtyStepper('sm')}
                <Button
                  onClick={handleAddToCart}
                  disabled={isAdding}
                  size="sm"
                  className="h-9 px-3 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
                >
                  {isAdding ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Scientific-style grid card (matches PeptSci reference artwork)
  return (
    <div className="@container group relative bg-linear-to-b from-[#0a1050] via-[#070b38] to-[#04051f] border border-white/10 rounded-2xl overflow-hidden transition-all hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 h-[560px] flex flex-col">
      {/* Reference artwork panel */}
      <div className="relative flex-1 overflow-hidden">
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
            /* Blend layout: per-compound spec blocks */
            <div className="space-y-3">
              {product.compounds.slice(0, 2).map((c, i) => (
                <div key={i}>
                  <h3 className="font-semibold tracking-tight text-white text-base @[16rem]:text-lg leading-tight">
                    {i === 0 ? (
                      <Link
                        href={`/shop/product/${encodeURIComponent(product.sku || product.id)}`}
                        className="hover:text-blue-300 transition-colors"
                      >
                        {c.name} {c.amount}
                      </Link>
                    ) : (
                      <>
                        {c.name} {c.amount}
                      </>
                    )}
                  </h3>
                  <p className="text-white/70 text-[11px] @[16rem]:text-xs leading-snug tracking-tight">
                    {c.casNumber && <>CAS #: {c.casNumber}</>}
                    {c.casNumber && c.molecularFormula && <span className="text-white/30"> | </span>}
                    {c.molecularFormula && formatMolecularFormula(c.molecularFormula)}
                  </p>
                  <p className="text-white/70 text-[11px] @[16rem]:text-xs leading-snug tracking-tight">
                    {c.molecularWeight && <>MW: {c.molecularWeight}</>}
                    {c.molecularWeight && c.purity && <span className="text-white/30"> | </span>}
                    {c.purity && <>{c.purity} Purity</>}
                  </p>
                </div>
              ))}
              {totalMg && (
                <p className="text-[#4d6bff] font-semibold tracking-tight text-base @[16rem]:text-lg pt-1">
                  Total {totalMg} (Blend)
                </p>
              )}
            </div>
          ) : (
            /* Single-compound layout */
            <>
              <h3 className="font-semibold tracking-tight text-white text-xl @[16rem]:text-2xl leading-tight">
                <Link
                  href={`/shop/product/${encodeURIComponent(product.sku || product.id)}`}
                  className="hover:text-blue-300 transition-colors"
                >
                  {isBlend ? product.name : compounds[0]?.name || product.name}
                </Link>
              </h3>
              {product.category && (
                <p className="mt-0.5 text-[#4d6bff] text-[10px] @[16rem]:text-[11px] font-medium uppercase tracking-tight line-clamp-2">
                  {product.category}
                </p>
              )}

              <div className="mt-3 space-y-1 text-sm @[16rem]:text-base tracking-tight text-white/90 pr-16 @[20rem]:pr-20">
                {product.casNumber && <p>CAS #: {product.casNumber}</p>}
                {product.molecularFormula && (
                  <p>Formula: {formatMolecularFormula(product.molecularFormula)}</p>
                )}
                {product.molecularWeight && <p>MW: {product.molecularWeight}</p>}
                <p>Purity: {purityDisplay}</p>
                {!isBlend && doseDisplay && <p>Size: {doseDisplay}</p>}
              </div>

              {isBlend && totalMg && (
                <p className="mt-3 text-[#4d6bff] font-semibold tracking-tight text-base @[16rem]:text-lg">
                  Total {totalMg} (Blend)
                </p>
              )}
            </>
          )}
        </div>

        {/* PRUO disclaimer - bottom-left of the artwork panel */}
        <div className="absolute bottom-5 left-5 right-24 @[18rem]:right-28">
          <div className="flex items-start gap-2">
            <span className="shrink-0 rounded-full border border-white/70 px-1.5 py-0.5 text-[9px] font-bold text-white leading-tight">
              PRUO
            </span>
            <span className="text-[10px] @[16rem]:text-[11px] font-semibold text-white leading-snug">
              Physician Research Use Only
            </span>
          </div>
          <p className="mt-1 text-[9px] @[16rem]:text-[10px] font-medium text-white/80">
            Not for human or veterinary use.
          </p>
        </div>

        {/* Vial with generated label - fully visible, anchored bottom-right */}
        <div className="absolute bottom-3 right-3 pointer-events-none">
          <ProductVial
            product={product}
            className="h-[158px] @[16rem]:h-[187px] drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)] transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      </div>

      {/* Price and Cart Section */}
      <div className="p-4 pt-3 border-t border-white/10 bg-black/20 space-y-3">
        {/* Price row */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-xl @[16rem]:text-2xl font-bold text-white">
              {unpriced ? '—' : formatPrice(product.displayPrice)}
            </p>
            {product.isCustomPrice && product.standardPrice && (
              <span className="text-sm text-white/40 line-through">
                {formatPrice(product.standardPrice)}
              </span>
            )}
          </div>
          {product.isCustomPrice && (
            <p className="text-xs font-medium text-green-400 shrink-0">Your account price</p>
          )}
        </div>

        {/* Action row - full width so the button is never clipped */}
        {isInCart ? (
          renderInCartControls(true)
        ) : outOfStock || unpriced ? (
          <div className="w-full h-10 flex items-center justify-center text-xs font-medium text-white/40 border border-white/10 rounded-xl">
            {unpriced ? 'Call for Pricing' : 'Out of Stock'}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {renderQtyStepper('lg')}
            <Button
              onClick={handleAddToCart}
              disabled={isAdding}
              className="h-10 flex-1 min-w-0 gap-1.5 px-2 text-sm bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl font-semibold"
            >
              {isAdding ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="truncate">Added</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    Add<span className="hidden @[17rem]:inline"> to Cart</span>
                  </span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* In cart indicator badge */}
      {isInCart && (
        <div className="absolute top-3 right-3 z-10">
          <div className="bg-green-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
            {cartItem?.quantity}
          </div>
        </div>
      )}
    </div>
  )
}
