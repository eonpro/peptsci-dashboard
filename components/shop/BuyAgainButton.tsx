'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCart } from './CartContext'
import { RotateCcw, Check, Loader2 } from 'lucide-react'

interface Props {
  orderId: string
  size?: 'sm' | 'default'
  className?: string
}

/**
 * "Buy again" — refills the cart with an order's items at the client's
 * current prices (fetched from /api/shop/orders/[id]/reorder) and opens the
 * cart drawer. Discontinued items are skipped and reported inline.
 */
export function BuyAgainButton({ orderId, size = 'sm', className }: Props) {
  const { addItem, openCart } = useCart()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  const handleClick = async (e: React.MouseEvent) => {
    // The button often sits inside a row that links to the order detail.
    e.preventDefault()
    e.stopPropagation()
    if (state === 'loading') return
    setState('loading')
    setNotice(null)
    try {
      const res = await fetch(`/api/shop/orders/${orderId}/reorder`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not load items')

      const items: Array<{ sku: string; name: string; dose: string | null; quantity: number; price: number }> =
        data.items ?? []
      for (const it of items) {
        addItem({
          id: it.sku,
          productId: it.sku,
          name: it.name,
          dose: it.dose ?? '',
          sku: it.sku,
          price: it.price,
          quantity: it.quantity,
        })
      }
      if ((data.unavailable ?? []).length > 0) {
        setNotice(`${data.unavailable.length} item(s) no longer available`)
      }
      if (items.length > 0) openCart()
      setState('done')
      setTimeout(() => setState('idle'), 2500)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not reorder')
      setState('idle')
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size={size}
        className={`rounded-xl ${className ?? ''}`}
        onClick={handleClick}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'done' ? (
          <>
            <Check className="h-4 w-4 mr-1" /> Added
          </>
        ) : (
          <>
            <RotateCcw className="h-4 w-4 mr-1" /> Buy again
          </>
        )}
      </Button>
      {notice && <span className="text-[11px] text-amber-400">{notice}</span>}
    </span>
  )
}
