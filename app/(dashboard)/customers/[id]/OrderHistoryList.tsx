'use client'

import { useState } from 'react'
import { Sale } from '@/lib/sheets'
import { ChevronRight, Package, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

interface OrderHistoryListProps {
  orders: Sale[]
}

// Helper function to get tracking info from tracking number
function getTrackingInfo(trackingNumber: string) {
  const cleanTracking = trackingNumber.trim()

  if (!cleanTracking || cleanTracking === 'NA') {
    return null
  }

  // Remove any prefix like "FedEx" if present
  const trackingOnly = cleanTracking.replace(/^(fedex|ups|usps|dhl)[:\s]*/i, '').trim()

  // Determine carrier based on tracking format
  let carrier = 'FedEx'
  let trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${trackingOnly}`

  if (trackingOnly.match(/^1Z[0-9A-Z]{16}$/i)) {
    carrier = 'UPS'
    trackingUrl = `https://www.ups.com/track?tracknum=${trackingOnly}`
  } else if (trackingOnly.match(/^(94|93|92|94|95)[0-9]{20}$/)) {
    carrier = 'USPS'
    trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${trackingOnly}`
  }

  return { carrier, trackingUrl, trackingNumber: trackingOnly }
}

export default function OrderHistoryList({ orders }: OrderHistoryListProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  // Group orders by date
  const groupedOrders = new Map<string, Sale[]>()

  orders.forEach((sale) => {
    if (!sale.Date) return
    const dateObj = sale.Date instanceof Date ? sale.Date : new Date(sale.Date)
    const dateKey = dateObj.toISOString().split('T')[0]

    if (!groupedOrders.has(dateKey)) {
      groupedOrders.set(dateKey, [])
    }
    groupedOrders.get(dateKey)!.push(sale)
  })

  // Convert to array and sort by date (newest first)
  const sortedGroupedOrders = Array.from(groupedOrders.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  )

  const toggleOrder = (orderKey: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderKey)) {
      newExpanded.delete(orderKey)
    } else {
      newExpanded.add(orderKey)
    }
    setExpandedOrders(newExpanded)
  }

  return (
    <div className="space-y-4">
      {sortedGroupedOrders.map(([dateKey, dateOrders]) => {
        const orderKey = dateKey
        const isExpanded = expandedOrders.has(orderKey)
        const firstOrder = dateOrders[0]
        const orderDate = firstOrder.Date ? toZonedTime(firstOrder.Date, 'America/New_York') : null
        const totalAmount = dateOrders.reduce((sum, sale) => sum + sale.PaidAmount, 0)
        const totalProfit = dateOrders.reduce((sum, sale) => sum + sale.Profit, 0)
        const totalCOGS = dateOrders.reduce((sum, sale) => sum + sale.COGS, 0)
        const avgMarkup = totalCOGS > 0 ? (totalProfit / totalCOGS) * 100 : 0
        const hasMultipleItems = dateOrders.length > 1
        const orderID = firstOrder.OrderID || `Order-${dateKey}`

        // Check if all items are fulfilled
        const allFulfilled = dateOrders.every(
          (sale) => sale.TrackingNumber && sale.TrackingNumber !== 'NA'
        )
        const allPaid = dateOrders.every((sale) => sale.InvoicePaid)

        return (
          <div key={orderKey} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
            <div
              className="flex items-start justify-between cursor-pointer"
              onClick={() => hasMultipleItems && toggleOrder(orderKey)}
            >
              <div className="flex items-start gap-3">
                {hasMultipleItems && (
                  <ChevronRight
                    className={`h-4 w-4 mt-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                )}
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{orderID}</span>
                    {orderDate && (
                      <span className="text-xs text-muted-foreground">
                        {format(orderDate, 'MMM dd, yyyy')}
                      </span>
                    )}
                    {!allPaid && (
                      <Badge variant="destructive" className="text-xs">
                        Needs Payment
                      </Badge>
                    )}
                    {allPaid && !allFulfilled && (
                      <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                        Needs Fulfillment
                      </Badge>
                    )}
                    {allFulfilled && (
                      <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                        Fulfilled
                      </Badge>
                    )}
                  </div>

                  {!hasMultipleItems ? (
                    // Single item - show details inline
                    <div className="text-sm text-muted-foreground">
                      {dateOrders[0].Product} - {dateOrders[0].Vials} vials
                      {dateOrders[0].Notes && (
                        <span className="ml-2 text-xs">Note: {dateOrders[0].Notes}</span>
                      )}
                    </div>
                  ) : (
                    // Multiple items - show summary
                    <div className="text-sm text-muted-foreground">{dateOrders.length} items</div>
                  )}

                  {/* Show tracking for single items or when expanded */}
                  {(!hasMultipleItems || isExpanded) && allFulfilled && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(() => {
                        // Get unique tracking numbers
                        const uniqueTrackingNumbers = new Set<string>()
                        const trackingLinks: JSX.Element[] = []

                        dateOrders.forEach((sale) => {
                          const trackingNumber = sale.TrackingNumber?.trim()
                          if (
                            !trackingNumber ||
                            trackingNumber === 'NA' ||
                            uniqueTrackingNumbers.has(trackingNumber)
                          ) {
                            return
                          }

                          uniqueTrackingNumbers.add(trackingNumber)
                          const tracking = getTrackingInfo(trackingNumber)
                          if (!tracking) return

                          trackingLinks.push(
                            <a
                              key={trackingNumber}
                              href={tracking.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
                            >
                              {tracking.carrier} Tracking: {tracking.trackingNumber}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )
                        })

                        return trackingLinks
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="font-bold">
                  $
                  {totalAmount.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-green-600">
                  Profit: $
                  {totalProfit.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div
                  className={`text-xs ${
                    avgMarkup >= 200
                      ? 'text-green-600'
                      : avgMarkup >= 100
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  Markup: {avgMarkup.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Expanded item details */}
            {isExpanded && hasMultipleItems && (
              <div className="mt-4 pl-7 space-y-2 border-t pt-3">
                {dateOrders.map((sale, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span>{sale.Product}</span>
                      <span className="text-muted-foreground">
                        {sale.Vials} vials @ ${sale.AmountPerVial.toFixed(2)}/vial
                      </span>
                    </div>
                    <span className="font-medium">
                      $
                      {sale.PaidAmount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {sortedGroupedOrders.length === 0 && (
        <p className="text-muted-foreground text-center py-8">No orders found for this customer</p>
      )}
    </div>
  )
}
