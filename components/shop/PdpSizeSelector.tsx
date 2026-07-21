import Link from 'next/link'
import type { SizeOption } from '@/lib/types/shop'
import { cn } from '@/lib/utils'

interface PdpSizeSelectorProps {
  options: SizeOption[]
  currentSku: string
}

/**
 * Size (mg) picker on the product detail page. Each size is its own SKU with
 * its own price/stock/COA, so selecting one navigates to that variant's PDP —
 * price, vial artwork, and COA all stay consistent with the chosen size.
 */
export function PdpSizeSelector({ options, currentSku }: PdpSizeSelectorProps) {
  if (options.length <= 1) return null

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price)

  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-medium text-white/70">Select Size</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.sku === currentSku
          const soldOut = option.inStock === false
          return (
            <Link
              key={option.sku}
              href={`/shop/product/${encodeURIComponent(option.sku)}`}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex min-w-[84px] flex-col items-center rounded-xl border px-4 py-2.5 transition-colors',
                active
                  ? 'border-brand-primary bg-brand-primary/20 text-white shadow-[0_4px_16px_-4px_rgba(33,60,239,0.7)]'
                  : 'border-white/15 bg-white/5 text-white/80 hover:border-blue-400/50 hover:bg-white/10 hover:text-white',
                soldOut && !active && 'opacity-50'
              )}
            >
              <span className="text-sm font-bold">{option.dose}</span>
              <span className={cn('text-xs', active ? 'text-white/80' : 'text-white/50')}>
                {soldOut
                  ? 'Out of stock'
                  : option.displayPrice > 0
                    ? formatPrice(option.displayPrice)
                    : 'Call'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
