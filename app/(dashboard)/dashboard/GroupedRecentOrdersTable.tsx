'use client'

import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Sale } from '@/lib/sheets'

interface GroupedOrder {
  date: Date
  customerName: string
  customerEmail: string
  orderId: string
  items: Sale[]
  totalAmount: number
  totalVials: number
  trackingNumber: string
  invoicePaid: boolean
  totalProfit: number
  profitMargin: number
  markup: number
}

interface GroupedRecentOrdersTableProps {
  data: Sale[]
}

export default function GroupedRecentOrdersTable({ data }: GroupedRecentOrdersTableProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Group orders by customer and date. This is an O(n) build + sort over the
  // full recent-orders set; memoize on `data` so it doesn't re-run on every
  // keystroke in the search box or page change.
  const groupedOrders = useMemo<GroupedOrder[]>(() => {
    const result: GroupedOrder[] = []
    const orderMap = new Map<string, GroupedOrder>()

    data.forEach((sale) => {
    if (!sale.Date) return

    const dateObj = sale.Date instanceof Date ? sale.Date : new Date(sale.Date)
    const dateKey = dateObj.toISOString().split('T')[0]
    const customerKey = `${sale.CustomerName}_${dateKey}`

    if (!orderMap.has(customerKey)) {
      orderMap.set(customerKey, {
        date: sale.Date,
        customerName: sale.CustomerName,
        customerEmail: sale.CustomerEmail || '',
        orderId: sale.OrderID,
        items: [],
        totalAmount: 0,
        totalVials: 0,
        trackingNumber: sale.TrackingNumber,
        invoicePaid: sale.InvoicePaid,
        totalProfit: 0,
        profitMargin: 0,
        markup: 0,
      })
    }

    const group = orderMap.get(customerKey)!
    group.items.push(sale)
    group.totalAmount += sale.PaidAmount
    group.totalVials += sale.Vials
    group.totalProfit += sale.Profit

    // Calculate total COGS for the group
    const totalCOGS = group.items.reduce((sum, item) => sum + item.COGS, 0)

    // Recalculate profit margin and markup for the group
    if (group.totalAmount > 0) {
      group.profitMargin = (group.totalProfit / group.totalAmount) * 100
    }
    if (totalCOGS > 0) {
      group.markup = (group.totalProfit / totalCOGS) * 100
    }
  })

    result.push(...Array.from(orderMap.values()))

    // Sort orders: unpaid first, then unfulfilled, then by date
    result.sort((a, b) => {
      // First priority: unpaid invoices
      if (a.invoicePaid !== b.invoicePaid) {
        return a.invoicePaid ? 1 : -1
      }

      // Second priority: unfulfilled orders (no tracking)
      const aHasTracking = Boolean(a.trackingNumber)
      const bHasTracking = Boolean(b.trackingNumber)

      if (aHasTracking !== bHasTracking) {
        return aHasTracking ? 1 : -1
      }

      // Otherwise sort by date (newest first)
      return b.date.getTime() - a.date.getTime()
    })

    return result
  }, [data])

  // Filter by search
  const filteredOrders = searchTerm
    ? groupedOrders.filter(
        (order) =>
          order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.items.some((item) => item.Product?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : groupedOrders

  const toggleOrder = (orderKey: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderKey)) {
      newExpanded.delete(orderKey)
    } else {
      newExpanded.add(orderKey)
    }
    setExpandedOrders(newExpanded)
  }

  const getTrackingInfo = (trackingNumber: string) => {
    if (!trackingNumber) return null

    if (trackingNumber.startsWith('1Z')) {
      return {
        url: `https://www.ups.com/track?tracknum=${trackingNumber}`,
        number: trackingNumber,
      }
    } else if (trackingNumber.match(/^\d{20,22}$/)) {
      return {
        url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
        number: trackingNumber,
      }
    } else if (trackingNumber.match(/^\d{12,14}$/)) {
      return {
        url: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
        number: trackingNumber,
      }
    }
    return { url: '', number: trackingNumber }
  }

  // Pagination
  const pageSize = 10
  const totalPages = Math.ceil(filteredOrders.length / pageSize)
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="w-full space-y-4">
      {/* Search */}
      <div className="flex items-center">
        <input
          placeholder="Search orders..."
          className="max-w-sm rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0e3a] px-4 py-2.5 text-sm text-gray-900 dark:text-white shadow-sm placeholder:text-gray-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 dark:focus:ring-[#213cef]/40 focus:border-brand-primary dark:focus:border-[#213cef] transition-all duration-200 hover:shadow-md"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setCurrentPage(1) // Reset to first page on search
          }}
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-[#0a0e3a]/50 shadow-sm border border-gray-100 dark:border-white/10 overflow-hidden hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-[#213cef]/5 transition-shadow duration-300">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/10 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-[#0a0e3a] dark:to-[#050722]">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider w-8"></th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Order ID
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Items
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Total
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Profit
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Markup
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-white/70 uppercase tracking-wider">
                Tracking
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const orderKey =
                order.orderId ||
                `${order.customerName}_${order.date.toISOString().split('T')[0]}_${order.totalAmount}`
              const isExpanded = expandedOrders.has(orderKey)
              const hasMultipleItems = order.items.length > 1
              const trackingInfo = order.trackingNumber
                ? getTrackingInfo(order.trackingNumber)
                : null

              return (
                <React.Fragment key={orderKey}>
                  <tr
                    className={`border-b border-gray-50 dark:border-white/5 hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all duration-200 group ${hasMultipleItems ? 'cursor-pointer' : ''}`}
                    onClick={() => hasMultipleItems && toggleOrder(orderKey)}
                  >
                    <td className="px-6 py-4">
                      {hasMultipleItems && (
                        <span className="text-gray-500 dark:text-white/50">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white/80">
                      {format(order.date, 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white/80">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{order.orderId}</span>
                        {!order.invoicePaid ? (
                          <span className="px-2 py-1 text-xs font-semibold bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 rounded-full">
                            Needs Payment
                          </span>
                        ) : !order.trackingNumber ? (
                          <span className="px-2 py-1 text-xs font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded-full">
                            Needs Fulfillment
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white/80">
                      {order.customerName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white/80">
                      {hasMultipleItems ? (
                        <span className="text-gray-600 dark:text-white/50">
                          {order.items.length} items ({order.totalVials} vials)
                        </span>
                      ) : (
                        <span>
                          {order.items[0].Product} ({order.items[0].Vials} vials)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white/80">
                      <span className="font-medium">
                        $
                        {order.totalAmount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        $
                        {order.totalProfit.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`font-medium ${order.markup >= 200 ? 'text-green-600 dark:text-green-400' : order.markup >= 100 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {order.markup.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {trackingInfo && trackingInfo.url ? (
                        <a
                          href={trackingInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-brand-primary dark:text-[#5B6EF7] hover:text-blue-700 dark:hover:text-[#7B8EFF] transition-all duration-200 text-sm font-medium group"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="group-hover:underline">{trackingInfo.number}</span>
                          <svg
                            className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : trackingInfo ? (
                        <span className="text-sm font-medium text-gray-600 dark:text-white/50">
                          {trackingInfo.number}
                        </span>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded items */}
                  {isExpanded && hasMultipleItems && (
                    <tr>
                      <td colSpan={9} className="px-6 py-0 bg-gray-50/50 dark:bg-[#050722]/50">
                        <div className="py-3">
                          <table className="w-full">
                            <thead>
                              <tr className="text-xs text-gray-600 dark:text-white/50 border-b border-gray-200 dark:border-white/10">
                                <th className="pb-2 text-left font-medium">Product</th>
                                <th className="pb-2 text-left font-medium">Vials</th>
                                <th className="pb-2 text-left font-medium">Price per Vial</th>
                                <th className="pb-2 text-left font-medium">Amount</th>
                                <th className="pb-2 text-left font-medium">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr key={idx} className="text-sm text-gray-900 dark:text-white/70">
                                  <td className="py-2 pr-4">{item.Product}</td>
                                  <td className="py-2 pr-4">{item.Vials}</td>
                                  <td className="py-2 pr-4">
                                    $
                                    {item.AmountPerVial.toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className="py-2 pr-4">
                                    $
                                    {item.PaidAmount.toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                  <td className="py-2 text-gray-600 dark:text-white/40">
                                    {item.Notes || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}

            {paginatedOrders.length === 0 && (
              <tr>
                <td colSpan={9} className="h-24 text-center text-gray-500 dark:text-white/50">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground dark:text-white/50">
            Showing{' '}
            <span className="text-gray-900 dark:text-white">
              {(currentPage - 1) * pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="text-gray-900 dark:text-white">
              {Math.min(currentPage * pageSize, filteredOrders.length)}
            </span>{' '}
            of <span className="text-gray-900 dark:text-white">{filteredOrders.length}</span>{' '}
            results
          </div>
          <div className="space-x-2">
            <button
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input dark:border-white/10 bg-background dark:bg-[#0a0e3a] hover:bg-accent dark:hover:bg-white/10 hover:text-accent-foreground dark:text-white/70 dark:hover:text-white h-9 rounded-md px-3"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input dark:border-white/10 bg-background dark:bg-[#0a0e3a] hover:bg-accent dark:hover:bg-white/10 hover:text-accent-foreground dark:text-white/70 dark:hover:text-white h-9 rounded-md px-3"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
