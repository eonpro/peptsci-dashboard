'use client'

import Link from 'next/link'
import { ArrowLeft, ShoppingBag, Minus, Plus, Trash2 } from 'lucide-react'
import { useStorefront } from '@/components/storefront/StorefrontContext'

export default function CartPage() {
  const { config, cart, removeFromCart, updateQuantity, cartSubtotal, cartItemCount } =
    useStorefront()
  const branding = config?.branding

  const shippingCost = cartSubtotal > 500 ? 0 : 25
  const tax = Math.round(cartSubtotal * 0.08 * 100) / 100
  const total = Math.round((cartSubtotal + shippingCost + tax) * 100) / 100

  if (cartItemCount === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-medium mb-2">Your cart is empty</h2>
        <Link
          href="/"
          className="inline-block px-6 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: branding?.colors.primary }}
        >
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Continue Shopping
      </Link>

      <h1 className="text-2xl font-bold mb-8">Shopping Cart ({cartItemCount})</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item) => (
            <div
              key={item.storefrontProductId}
              className="flex gap-4 p-4 border rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">{item.name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {item.sku} {item.dose && `/ ${item.dose}`}
                </p>
                <p className="font-semibold mt-2" style={{ color: branding?.colors.primary }}>
                  ${item.retailPrice.toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <button
                  onClick={() => removeFromCart(item.storefrontProductId)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1 border rounded-lg">
                  <button
                    onClick={() => updateQuantity(item.storefrontProductId, item.quantity - 1)}
                    className="p-2 hover:bg-gray-50 rounded-l-lg"
                    disabled={item.quantity <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.storefrontProductId, item.quantity + 1)}
                    className="p-2 hover:bg-gray-50 rounded-r-lg"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-sm font-medium">
                  ${(item.retailPrice * item.quantity).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div>
          <div className="border rounded-xl p-5 sticky top-24">
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span>{shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax (est.)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span style={{ color: branding?.colors.primary }}>${total.toFixed(2)}</span>
              </div>
            </div>
            {cartSubtotal < 500 && (
              <p className="text-xs text-gray-500 mt-3">
                Add ${(500 - cartSubtotal).toFixed(2)} more for free shipping
              </p>
            )}
            <Link href="/checkout" className="block mt-4">
              <button
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors hover:opacity-90"
                style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
              >
                Proceed to Checkout
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
