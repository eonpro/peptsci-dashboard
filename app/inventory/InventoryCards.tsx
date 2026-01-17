'use client'

import { Inventory } from '@/lib/sheets'
import { Card } from '@/components/ui/card'

interface InventoryCardsProps {
  inventory: Inventory[]
}

export default function InventoryCards({ inventory }: InventoryCardsProps) {
  const LOW_STOCK_THRESHOLD = 10

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {inventory.map((item, index) => {
        const opportunityValue = item.SRP * item.InventoryAvailable
        const isLowStock = item.InventoryAvailable <= LOW_STOCK_THRESHOLD

        return (
          <Card 
            key={`${item.SKU || 'sku'}-${item.MedicationName}-${item.Dose}-${index}`} 
            className={`p-4 transition-all duration-300 bg-white ${
              isLowStock 
                ? 'hover:bg-red-50 hover:shadow-lg hover:border-red-200' 
                : 'hover:shadow-lg'
            }`}
          >
            <div className="space-y-3">
              {/* Header with SKU and Low Stock tag */}
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-500 font-medium">SKU: {item.SKU}</span>
                {isLowStock && (
                  <span className="text-xs font-medium text-red-600">
                    #LOWSTOCK
                  </span>
                )}
              </div>

              {/* Product Name */}
              <h3 className="text-base font-medium text-gray-900">
                {item.MedicationName} {item.Dose}
              </h3>

              {/* Badges Row */}
              <div className="flex gap-2 flex-wrap">
                <div className="bg-green-600 text-white px-2 py-1 rounded-md text-xs font-medium">
                  COST: ${item.Cost?.toFixed(0) || '0'}
                </div>
                <div className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-medium">
                  SRP: ${item.SRP.toFixed(0)}
                </div>
                <div className="bg-gray-900 text-white px-2 py-1 rounded-md text-xs font-medium">
                  ORDERED: {item.InventoryOrdered.toLocaleString()}
                </div>
              </div>

              {/* Current Inventory */}
              <div className="py-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-gray-600 font-medium">CURRENT:</span>
                  <span className="text-3xl font-semibold text-red-600">
                    {item.InventoryAvailable}
                  </span>
                </div>
              </div>

              {/* Opportunity Value */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 font-medium">VALUE:</span>
                  <span className="text-lg font-medium text-blue-600">
                    ${opportunityValue.toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    })}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
