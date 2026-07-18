'use client'

import { useCart, MAX_ITEM_QUANTITY } from './CartContext'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, X, Package } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { FREE_SHIPPING_THRESHOLD } from '@/lib/checkout-core'

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal, clearCart, totalItems } =
    useCart()

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  // Free-shipping progress mirrors lib/checkout-core: crossing the threshold
  // makes 2-DAY shipping free (overnight stays discounted, not free).
  const freeShippingThreshold = FREE_SHIPPING_THRESHOLD
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal)
  const freeShippingProgress = Math.min(100, (subtotal / freeShippingThreshold) * 100)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      {/* Full screen on mobile, side drawer on desktop */}
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg bg-brand-onyx border-l border-white/10 text-white data-[state=open]:duration-300">
        {/* Custom header for better mobile UX */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 bg-brand-onyx">
          <SheetTitle className="flex items-center gap-3 text-white">
            <div className="relative">
              <ShoppingCart className="h-6 w-6" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-primary text-white text-[10px] font-bold">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="text-lg font-semibold">Your Cart</span>
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeCart}
            className="h-10 w-10 rounded-full text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Free shipping progress - mobile optimized */}
        {items.length > 0 && (
          <div className="px-4 py-3 bg-[#0a0e3a] border-b border-white/10">
            {remainingForFreeShipping > 0 ? (
              <>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-white/70">
                    Add {formatPrice(remainingForFreeShipping)} for FREE 2-day shipping
                  </span>
                  <span className="text-white/50">
                    {formatPrice(subtotal)} / {formatPrice(freeShippingThreshold)}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-brand-primary to-[#4f6cff] rounded-full transition-all duration-500"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-green-400">
                <Package className="h-4 w-4" />
                <span className="text-sm font-medium">You qualify for FREE 2-day shipping!</span>
              </div>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
            <div className="rounded-full bg-white/5 p-8">
              <ShoppingCart className="h-16 w-16 text-white/20" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold text-white">Your cart is empty</p>
              <p className="text-white/60 max-w-[250px]">
                Discover our premium research peptides and add items to get started.
              </p>
            </div>
            <Button
              onClick={closeCart}
              asChild
              className="bg-brand-primary hover:bg-[#1a30c0] text-white h-12 px-8 rounded-xl text-base"
            >
              <Link href="/shop">Browse Catalog</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Scrollable items area */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-[#0a0e3a] p-3"
                  >
                    {/* Product image - larger touch target */}
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-linear-to-br from-brand-primary/20 to-brand-primary/5">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-2xl font-bold text-brand-primary">
                            {item.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Product details */}
                    <div className="flex flex-1 flex-col min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-base leading-tight line-clamp-2">
                            {item.name}
                          </h3>
                          <p className="text-sm text-white/60 mt-0.5">{item.dose}</p>
                        </div>
                        {/* Delete button - larger touch target */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 -mt-1 -mr-1 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl shrink-0"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="mt-auto flex items-center justify-between pt-2">
                        {/* Quantity controls - larger for touch */}
                        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-white hover:bg-white/10 rounded-lg"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={MAX_ITEM_QUANTITY}
                            value={item.quantity}
                            aria-label={`Quantity for ${item.name}`}
                            onChange={(e) => {
                              const parsed = parseInt(e.target.value, 10)
                              if (!Number.isNaN(parsed)) {
                                updateQuantity(item.id, Math.min(parsed, MAX_ITEM_QUANTITY))
                              }
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-12 h-10 bg-transparent text-center font-semibold text-white text-lg outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-white hover:bg-white/10 rounded-lg"
                            disabled={item.quantity >= MAX_ITEM_QUANTITY}
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Price */}
                        <p className="font-bold text-white text-lg">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Fixed bottom checkout section - safe area aware */}
            <div className="border-t border-white/10 bg-brand-onyx p-4 pb-6 md:pb-4 space-y-4">
              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Subtotal ({totalItems} items)</span>
                  <span className="font-medium text-white">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Shipping</span>
                  <span
                    className={
                      remainingForFreeShipping === 0
                        ? 'text-green-400 font-medium'
                        : 'text-white/50'
                    }
                  >
                    {remainingForFreeShipping === 0 ? 'FREE' : 'Calculated at checkout'}
                  </span>
                </div>
              </div>

              <Separator className="bg-white/10" />

              {/* Total */}
              <div className="flex justify-between text-xl font-bold text-white">
                <span>Total</span>
                <span>{formatPrice(subtotal)}</span>
              </div>

              {/* Checkout button - large touch target */}
              <Button
                className="w-full bg-brand-primary hover:bg-[#1a30c0] text-white h-14 rounded-2xl text-lg font-semibold shadow-lg shadow-brand-primary/25"
                asChild
              >
                <Link href="/shop/checkout" onClick={closeCart}>
                  Checkout
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>

              {/* Secondary actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-12 border-white/20 bg-white/5 text-white hover:bg-white/10 rounded-xl"
                  onClick={closeCart}
                  asChild
                >
                  <Link href="/shop">Continue Shopping</Link>
                </Button>
                <Button
                  variant="ghost"
                  className="h-12 px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                  onClick={clearCart}
                >
                  Clear All
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
