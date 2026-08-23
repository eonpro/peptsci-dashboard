'use client'

import { useEffect, useMemo, useState } from 'react'
import { Droplets } from 'lucide-react'
import { useCart } from './CartContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProductVial, BACTERIOSTATIC_WATER_IMAGE } from './ProductVial'
import {
  shouldOfferBacWaterAtCheckout,
  suggestedBacWaterQty,
} from '@/lib/shop/bac-water'
import { cn } from '@/lib/utils'

interface BacWaterOption {
  sku: string
  name: string
  dose: string
  price: number
  inStock: boolean
  presentation: 'peptsci-label' | 'hospira'
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
}

/**
 * Checkout reconstitution offer: one BAC-water vial per peptide vial, hidden
 * once the clinic has already added BAC water.
 */
export function CheckoutBacWaterOffer() {
  const { items, addItem } = useCart()
  const [options, setOptions] = useState<BacWaterOption[]>([])
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const offer = shouldOfferBacWaterAtCheckout(items)
  const qty = suggestedBacWaterQty(items)

  useEffect(() => {
    if (!offer) return
    let cancelled = false
    fetch('/api/shop/bac-water')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { options?: BacWaterOption[] } | null) => {
        if (cancelled || !data?.options?.length) return
        setOptions(data.options)
        setSelectedSku((current) => current ?? data.options![0]!.sku)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [offer])

  const selected = useMemo(
    () => options.find((o) => o.sku === selectedSku) ?? options[0] ?? null,
    [options, selectedSku]
  )

  if (!offer || !selected || qty < 1) return null

  const lineTotal = selected.price * qty

  const handleAdd = () => {
    setAdding(true)
    addItem({
      id: selected.sku,
      productId: selected.sku,
      name: selected.name,
      dose: selected.dose,
      sku: selected.sku,
      price: selected.price,
      quantity: qty,
      image: selected.presentation === 'hospira' ? BACTERIOSTATIC_WATER_IMAGE : undefined,
    })
    setAdding(false)
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-white/10 bg-[#0a0e3a]">
      <CardHeader className="border-b border-white/10 bg-white/5">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/20">
            <Droplets className="h-5 w-5 text-brand-primary" />
          </div>
          Bacteriostatic water
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 md:p-6">
        <p className="text-sm text-white/70">
          Add one vial per peptide vial in this order ({qty}×). Skip if you already have stock on
          the shelf.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => {
            const active = option.sku === selected.sku
            return (
              <button
                key={option.sku}
                type="button"
                onClick={() => setSelectedSku(option.sku)}
                className={cn(
                  'flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-colors',
                  active
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                )}
              >
                <div className="mb-2 h-16 w-8">
                  {option.presentation === 'hospira' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={BACTERIOSTATIC_WATER_IMAGE}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ProductVial
                      product={{ name: option.name, dose: option.dose, sku: option.sku }}
                      className="h-full w-auto"
                    />
                  )}
                </div>
                <span className="text-xs font-semibold text-white">{option.dose}</span>
                <span className="text-[11px] text-white/60">{formatPrice(option.price)}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">
            {qty} × {selected.dose} ={' '}
            <span className="font-semibold text-white">{formatPrice(lineTotal)}</span>
          </p>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="h-11 rounded-xl bg-brand-primary px-5 font-semibold text-white hover:bg-[#1a30c0]"
          >
            Add to order
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
