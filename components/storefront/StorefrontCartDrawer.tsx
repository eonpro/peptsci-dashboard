'use client'

import { useStorefront } from './StorefrontContext'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * Storefront cart drawer built on the Sheet primitive so keyboard users get a
 * real dialog: focus trap, Escape to close, aria-modal, and body scroll lock.
 * Tenant brand colors arrive as JS values (branding.colors) because the sheet
 * portals to <body>, outside the storefront's CSS-variable scope.
 */
export function StorefrontCartDrawer() {
  const {
    config,
    cart,
    toggleCartDrawer,
    removeFromCart,
    updateQuantity,
    cartSubtotal,
    cartItemCount,
  } = useStorefront()

  const branding = config?.branding
  const primary = branding?.colors.primary ?? '#213cef'

  return (
    <Sheet open={cart.isOpen} onOpenChange={(open) => !open && toggleCartDrawer()}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 border-l border-gray-200 bg-white p-0 text-gray-900"
      >
        {/* Header */}
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ShoppingBag className="h-5 w-5" style={{ color: primary }} />
            Cart ({cartItemCount})
          </SheetTitle>
        </SheetHeader>

        {/* Items */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {cart.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <ShoppingBag className="mb-3 h-12 w-12" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            cart.items.map((item) => (
              <div key={item.storefrontProductId} className="flex gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.sku} {item.dose && `/ ${item.dose}`}
                  </p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: primary }}>
                    ${item.retailPrice.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => removeFromCart(item.storefrontProductId)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 rounded-full border">
                    <button
                      onClick={() => updateQuantity(item.storefrontProductId, item.quantity - 1)}
                      className="rounded-full p-1 hover:bg-gray-100 disabled:opacity-40"
                      disabled={item.quantity <= 1}
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.storefrontProductId, item.quantity + 1)}
                      className="rounded-full p-1 hover:bg-gray-100"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="space-y-3 border-t p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold">${cartSubtotal.toFixed(2)}</span>
            </div>
            <a href="/checkout" className="block">
              <button
                className="w-full rounded-lg py-3 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: primary }}
              >
                Checkout &mdash; ${cartSubtotal.toFixed(2)}
              </button>
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
