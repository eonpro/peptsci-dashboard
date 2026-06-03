'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { ShopProduct } from '@/lib/types/shop'
import { Button } from '@/components/ui/button'
import { useCart } from './CartContext'
import { cn } from '@/lib/utils'
import { ShoppingCart, Check } from 'lucide-react'

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
  const { addItem, items, openCart } = useCart()
  const [isAdding, setIsAdding] = useState(false)

  const productId = product.id
  const isInCart = items.some((item) => item.id === productId)
  const cartItem = items.find((item) => item.id === productId)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
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
      quantity: 1,
      image: undefined,
    })

    setTimeout(() => {
      setIsAdding(false)
    }, 600)
  }

  // Determine if this is a blend (contains multiple peptides)
  const isBlend =
    product.name.toLowerCase().includes('blend') ||
    product.name.toLowerCase().includes('/') ||
    product.name.toLowerCase().includes('+')

  // Parse dose from product - try multiple sources
  const doseDisplay = product.dose 
    || (product.milligrams ? `${product.milligrams}mg` : '')
    || `${product.name.match(/\d+mg/)?.[0] || ''}`

  // Mobile-optimized list view
  if (viewMode === 'list') {
    return (
      <div className="bg-gradient-to-br from-[#0a0e3a] to-[#050722] border border-white/10 rounded-2xl p-4 transition-all active:scale-[0.98]">
        <div className="flex items-center gap-4">
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
            <h3 className="font-bold text-white text-lg leading-tight truncate">{product.name}</h3>
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
              <p className="text-xl font-bold text-white">{formatPrice(product.displayPrice)}</p>
            </div>
            {isInCart ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-xl"
                onClick={openCart}
              >
                <Check className="mr-1 h-4 w-4" />
                {cartItem?.quantity}
              </Button>
            ) : (
              <Button
                onClick={handleAddToCart}
                disabled={isAdding}
                size="sm"
                className="h-9 px-3 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl"
              >
                {isAdding ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Scientific-style grid card (matches reference image)
  return (
    <div className="group relative bg-gradient-to-br from-[#0a0e3a] via-[#0d1242] to-[#050722] border border-white/10 rounded-2xl overflow-hidden transition-all hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 h-[420px] flex flex-col">
      {/* Header with logo and type badge */}
      <div className="flex items-start justify-between p-4 pb-2">
        <Image
          src={PEPTSCI_LOGO_URL}
          alt="PeptSci Research"
          width={120}
          height={40}
          className="h-8 w-auto"
        />
        <span
          className={cn(
            'text-sm font-semibold px-3 py-1 rounded-full',
            isBlend ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
          )}
        >
          {isBlend ? 'Blend' : 'Single'}
        </span>
      </div>

      {/* Main content - scrollable area for compounds */}
      <div className="flex-1 px-4 py-2 overflow-hidden">
        {/* Product name */}
        <h3 className="font-bold text-white text-xl leading-tight mb-1">{product.name}</h3>

        {/* Dose */}
        <p className="text-white/70 text-lg mb-3">{doseDisplay}</p>

        {/* Scientific details */}
        <div className="space-y-1.5 text-sm">
          {product.casNumber && (
            <p className="text-white/60">
              <span className="text-white/40">CAS #:</span>{' '}
              <span className="text-white/80">{product.casNumber}</span>
            </p>
          )}
          {product.molecularFormula && (
            <p className="text-white/60">
              <span className="text-white/40">Formula:</span>{' '}
              <span className="text-white/80">{formatMolecularFormula(product.molecularFormula)}</span>
            </p>
          )}
          {product.molecularWeight && (
            <p className="text-white/60">
              <span className="text-white/40">MW:</span>{' '}
              <span className="text-white/80">{product.molecularWeight}</span>
            </p>
          )}
          {/* Default purity */}
          <p className="text-white/60">
            <span className="text-white/40">Purity:</span>{' '}
            <span className="text-green-400 font-medium">≥99%</span>
          </p>
        </div>

        {/* Category badge */}
        {product.category && (
          <div className="mt-3">
            <span className="inline-block text-xs font-medium px-2 py-1 rounded-full bg-white/5 text-white/50 border border-white/10">
              {product.category}
            </span>
          </div>
        )}
      </div>

      {/* Footer - PRUO disclaimer */}
      <div className="px-4 py-2 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[10px]">
            PRUO
          </span>
          <span className="text-white/40">Physician Research Use Only</span>
        </div>
      </div>

      {/* Price and Cart Section */}
      <div className="p-4 pt-2 border-t border-white/10 bg-black/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-white">{formatPrice(product.displayPrice)}</p>
              {product.isCustomPrice && product.standardPrice && (
                <span className="text-sm text-white/40 line-through">
                  {formatPrice(product.standardPrice)}
                </span>
              )}
            </div>
            {product.isCustomPrice ? (
              <p className="text-xs font-medium text-green-400">Your account price</p>
            ) : (
              product.costPrice && (
                <p className="text-xs text-white/40">Wholesale: {formatPrice(product.costPrice)}</p>
              )
            )}
          </div>

          {isInCart ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs border-green-500/50 text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg"
              onClick={openCart}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              In Cart ({cartItem?.quantity})
            </Button>
          ) : (
            <Button
              onClick={handleAddToCart}
              disabled={isAdding}
              size="sm"
              className="h-8 px-3 text-xs bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-lg font-medium"
            >
              {isAdding ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                  Add
                </>
              )}
            </Button>
          )}
        </div>
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
