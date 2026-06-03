'use client'

import { useStorefront } from './StorefrontContext'
import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'

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

  if (!cart.isOpen) return null

  const branding = config?.branding

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={toggleCartDrawer} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" style={{ color: branding?.colors.primary }} />
            Cart ({cartItemCount})
          </h2>
          <button onClick={toggleCartDrawer} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingBag className="h-12 w-12 mb-3" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            cart.items.map((item) => (
              <div key={item.storefrontProductId} className="flex gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    {item.sku} {item.dose && `/ ${item.dose}`}
                  </p>
                  <p className="text-sm font-semibold mt-1" style={{ color: branding?.colors.primary }}>
                    ${item.retailPrice.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => removeFromCart(item.storefrontProductId)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 border rounded-full">
                    <button
                      onClick={() =>
                        updateQuantity(item.storefrontProductId, item.quantity - 1)
                      }
                      className="p-1 hover:bg-gray-100 rounded-full"
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() =>
                        updateQuantity(item.storefrontProductId, item.quantity + 1)
                      }
                      className="p-1 hover:bg-gray-100 rounded-full"
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
          <div className="border-t p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold">${cartSubtotal.toFixed(2)}</span>
            </div>
            {cartSubtotal < 500 && (
              <p className="text-xs text-gray-500">
                Add ${(500 - cartSubtotal).toFixed(2)} more for free shipping
              </p>
            )}
            <a href="/checkout" className="block">
              <button
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors"
                style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
              >
                Checkout &mdash; ${cartSubtotal.toFixed(2)}
              </button>
            </a>
          </div>
        )}
      </div>
    </>
  )
}
