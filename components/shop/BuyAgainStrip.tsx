'use client'

import { useEffect, useState } from 'react'
import { useCart } from './CartContext'
import { Button } from '@/components/ui/button'
import { RotateCcw, Plus, Check } from 'lucide-react'

interface ReorderItem {
  sku: string
  name: string
  dose: string | null
  unitPrice: number
  isCustomPrice: boolean
  inStock: boolean
  timesOrdered: number
}

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

/**
 * One-tap reorder strip: the client's most-ordered items at current pricing.
 * Renders nothing for clients without order history — first-time buyers go
 * straight to the catalog.
 */
export function BuyAgainStrip() {
  const { addItem, items: cartItems, openCart } = useCart()
  const [items, setItems] = useState<ReorderItem[] | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/shop/quick-reorder')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setItems(data?.items ?? [])
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [])

  if (!items || items.length === 0) return null

  const add = (item: ReorderItem) => {
    addItem({
      id: item.sku,
      productId: item.sku,
      name: item.name,
      dose: item.dose ?? '',
      sku: item.sku,
      price: item.unitPrice,
      quantity: 1,
    })
    setJustAdded(item.sku)
    setTimeout(() => setJustAdded((prev) => (prev === item.sku ? null : prev)), 1200)
  }

  return (
    <section aria-label="Buy it again">
      <div className="mb-3 flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-brand-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
          Buy it again
        </h2>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide md:mx-0 md:px-0">
        {items.map((item) => {
          const inCart = cartItems.some((c) => c.id === item.sku)
          return (
            <div
              key={item.sku}
              className="flex w-56 shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-[#0a0e3a] p-4 transition-colors hover:border-brand-primary/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                <p className="mt-0.5 text-xs text-white/50">
                  {item.dose ?? ''} · ordered {item.timesOrdered}×
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-bold text-white">{usd(item.unitPrice)}</p>
                  {item.isCustomPrice && (
                    <p className="text-[10px] font-medium text-green-400">Your price</p>
                  )}
                </div>
                {item.inStock ? (
                  inCart ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0 rounded-xl border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300"
                      onClick={openCart}
                    >
                      <Check className="mr-1 h-4 w-4" /> In cart
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-9 shrink-0 rounded-xl bg-brand-primary text-white hover:bg-[#1a30c0]"
                      onClick={() => add(item)}
                      aria-label={`Add ${item.name} to cart`}
                    >
                      {justAdded === item.sku ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <>
                          <Plus className="mr-1 h-4 w-4" /> Add
                        </>
                      )}
                    </Button>
                  )
                ) : (
                  <span className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-white/40">
                    Out of stock
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
