'use client'

import { useState } from 'react'
import { Inventory } from '@/lib/sheets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useCart } from './CartContext'
import { cn } from '@/lib/utils'
import { ShoppingCart, Plus, Minus, Check, Package } from 'lucide-react'

interface ProductCardProps {
  product: Inventory
  viewMode?: 'grid' | 'list'
}

export function ProductCard({ product, viewMode = 'grid' }: ProductCardProps) {
  const { addItem, items, openCart } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [isAdding, setIsAdding] = useState(false)

  const productId = `${product.MedicationName}-${product.Dose}-${product.SKU}`
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
      productId: product.SKU || productId,
      name: product.MedicationName,
      dose: product.Dose,
      sku: product.SKU || 'N/A',
      price: product.SRP,
      quantity,
    })
    
    // Reset and show feedback
    setTimeout(() => {
      setIsAdding(false)
      setQuantity(1)
    }, 600)
  }

  // Determine product category color
  const getCategoryColor = (name: string) => {
    const firstWord = name.split(' ')[0].toLowerCase()
    const colors: Record<string, string> = {
      semaglutide: 'from-blue-500 to-indigo-600',
      tirzepatide: 'from-purple-500 to-pink-600',
      retatrutide: 'from-orange-500 to-red-600',
      bpc: 'from-green-500 to-emerald-600',
      pt: 'from-cyan-500 to-blue-600',
      nad: 'from-amber-500 to-orange-600',
    }
    return colors[firstWord] || 'from-gray-500 to-slate-600'
  }

  if (viewMode === 'list') {
    return (
      <Card className="overflow-hidden transition-all hover:shadow-md">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-4">
            {/* Product image/placeholder */}
            <div
              className={cn(
                'relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br',
                getCategoryColor(product.MedicationName)
              )}
            >
              <div className="flex h-full items-center justify-center">
                <Package className="h-8 w-8 text-white/80" />
              </div>
            </div>

            {/* Product details */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {product.MedicationName}
              </h3>
              <p className="text-sm text-gray-600">{product.Dose}</p>
              <p className="text-xs text-gray-400">SKU: {product.SKU || 'N/A'}</p>
            </div>

            {/* Price and actions */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">
                  {formatPrice(product.SRP)}
                </p>
                {product.Cost > 0 && (
                  <p className="text-xs text-gray-400">
                    Cost: {formatPrice(product.Cost)}
                  </p>
                )}
              </div>

              {isInCart ? (
                <Button
                  variant="outline"
                  className="border-green-500 text-green-600"
                  onClick={openCart}
                >
                  <Check className="mr-2 h-4 w-4" />
                  In Cart ({cartItem?.quantity})
                </Button>
              ) : (
                <Button
                  onClick={handleAddToCart}
                  disabled={isAdding}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isAdding ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <ShoppingCart className="mr-2 h-4 w-4" />
                  )}
                  Add to Cart
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
      {/* Product image/placeholder */}
      <div
        className={cn(
          'relative h-40 overflow-hidden bg-gradient-to-br',
          getCategoryColor(product.MedicationName)
        )}
      >
        <div className="flex h-full items-center justify-center">
          <Package className="h-16 w-16 text-white/60 transition-transform group-hover:scale-110" />
        </div>
        
        {/* Category badge */}
        <Badge
          variant="secondary"
          className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm"
        >
          {product.MedicationName.split(' ')[0]}
        </Badge>

        {/* Quick add button - appears on hover */}
        {!isInCart && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              size="lg"
              className="bg-white text-gray-900 hover:bg-gray-100"
              onClick={handleAddToCart}
              disabled={isAdding}
            >
              {isAdding ? (
                <>
                  <Check className="mr-2 h-5 w-5 text-green-500" />
                  Added!
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Quick Add
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Product name and dose */}
        <div>
          <h3 className="font-semibold text-gray-900 line-clamp-1">
            {product.MedicationName}
          </h3>
          <p className="text-sm text-gray-600">{product.Dose}</p>
        </div>

        {/* SKU */}
        <p className="text-xs text-gray-400">SKU: {product.SKU || 'N/A'}</p>

        {/* Price */}
        <div className="flex items-end justify-between pt-2">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {formatPrice(product.SRP)}
            </p>
            {product.Cost > 0 && (
              <p className="text-xs text-gray-400">
                Margin: {Math.round(((product.SRP - product.Cost) / product.SRP) * 100)}%
              </p>
            )}
          </div>

          {/* Add to cart / In cart */}
          {isInCart ? (
            <Button
              variant="outline"
              size="sm"
              className="border-green-500 text-green-600"
              onClick={openCart}
            >
              <Check className="mr-1 h-4 w-4" />
              In Cart
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {/* Quantity selector */}
              <div className="flex items-center border rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">
                  {quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {/* Add button */}
              <Button
                size="icon"
                onClick={handleAddToCart}
                disabled={isAdding}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isAdding ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
