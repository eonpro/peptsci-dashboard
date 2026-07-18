'use client'

import { useState } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { Button } from '@/components/ui/button'
import { useCart, MAX_ITEM_QUANTITY } from './CartContext'
import { ShoppingCart, Check, Minus, Plus } from 'lucide-react'

interface PdpAddToCartProps {
  product: ShopProduct
}

/**
 * Add-to-cart panel for the product detail page. Mirrors ProductCard's cart
 * behavior: quantity stepper capped by sellable stock, in-cart controls once
 * added, and disabled states for out-of-stock / unpriced products.
 */
export function PdpAddToCart({ product }: PdpAddToCartProps) {
  const { addItem, items, updateQuantity, openCart } = useCart()
  const [isAdding, setIsAdding] = useState(false)
  const [qty, setQty] = useState(1)

  // Same cart line key as ProductCard/BuyAgain (SKU first) so add paths merge.
  const productId = product.sku || product.id
  const cartItem = items.find((item) => item.id === productId)

  const outOfStock = product.inStock === false
  const unpriced = !(product.displayPrice > 0)
  const maxQty = Math.min(
    MAX_ITEM_QUANTITY,
    typeof product.inventoryOnHand === 'number' && product.inventoryOnHand > 0
      ? product.inventoryOnHand
      : MAX_ITEM_QUANTITY
  )

  const clampQty = (value: number) => Math.min(Math.max(1, value), maxQty)

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
    openCart()
    setTimeout(() => setIsAdding(false), 600)
  }

  if (outOfStock || unpriced) {
    return (
      <div className="w-full h-14 flex items-center justify-center text-sm font-medium text-white/40 border border-white/10 rounded-xl">
        {unpriced ? 'Call for Pricing' : 'Out of Stock'}
      </div>
    )
  }

  if (cartItem) {
    return (
      <div className="flex h-14 w-full items-center justify-between rounded-xl border border-green-500/50 bg-green-500/10">
        <button
          type="button"
          aria-label="Decrease quantity in cart"
          onClick={() => updateQuantity(productId, cartItem.quantity - 1)}
          className="flex h-full w-14 items-center justify-center text-green-400 hover:text-green-300"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={openCart}
          className="h-full flex-1 truncate px-1 text-center text-base font-semibold text-green-400"
          title="View cart"
        >
          {cartItem.quantity} in cart
        </button>
        <button
          type="button"
          aria-label="Increase quantity in cart"
          onClick={() => updateQuantity(productId, cartItem.quantity + 1)}
          disabled={cartItem.quantity >= maxQty}
          className="flex h-full w-14 items-center justify-center text-green-400 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 shrink-0 items-center rounded-xl border border-white/15 bg-white/5">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => setQty((q) => clampQty(q - 1))}
          disabled={qty <= 1}
          className="flex h-full w-11 items-center justify-center text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={maxQty}
          value={qty}
          aria-label="Quantity"
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            setQty(Number.isNaN(parsed) ? 1 : clampQty(parsed))
          }}
          onFocus={(e) => e.target.select()}
          className="h-full w-12 bg-transparent text-center text-base font-semibold text-white outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => setQty((q) => clampQty(q + 1))}
          disabled={qty >= maxQty}
          className="flex h-full w-11 items-center justify-center text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <Button
        size="lg"
        onClick={handleAddToCart}
        disabled={isAdding}
        className="h-14 flex-1 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl text-lg font-semibold"
      >
        {isAdding ? (
          <>
            <Check className="mr-2 h-5 w-5" />
            Added
          </>
        ) : (
          <>
            <ShoppingCart className="mr-2 h-5 w-5" />
            Add to Cart
          </>
        )}
      </Button>
    </div>
  )
}
