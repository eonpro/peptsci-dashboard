'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Package, 
  Search, 
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ShoppingBag
} from 'lucide-react'

// Mock orders data - in production, this would come from the API
const mockOrders = [
  {
    id: 'ORD-2026011701',
    date: '2026-01-17',
    status: 'processing',
    items: [
      { name: 'Semaglutide', dose: '2.5mg', quantity: 10, price: 89.99 },
      { name: 'Tirzepatide', dose: '5mg', quantity: 5, price: 149.99 },
    ],
    total: 1649.85,
    tracking: null,
  },
  {
    id: 'ORD-2026011501',
    date: '2026-01-15',
    status: 'shipped',
    items: [
      { name: 'BPC-157', dose: '5mg', quantity: 20, price: 45.00 },
    ],
    total: 925.00,
    tracking: '1Z999AA10123456784',
  },
  {
    id: 'ORD-2026011001',
    date: '2026-01-10',
    status: 'delivered',
    items: [
      { name: 'NAD+', dose: '100mg', quantity: 3, price: 199.99 },
    ],
    total: 635.97,
    tracking: '1Z999AA10123456785',
  },
  {
    id: 'ORD-2025122001',
    date: '2025-12-20',
    status: 'cancelled',
    items: [
      { name: 'PT-141', dose: '10mg', quantity: 2, price: 79.99 },
    ],
    total: 175.98,
    tracking: null,
  },
]

type OrderStatus = 'all' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

const statusConfig = {
  processing: {
    label: 'Processing',
    color: 'bg-yellow-100 text-yellow-700',
    icon: Clock,
  },
  shipped: {
    label: 'Shipped',
    color: 'bg-blue-100 text-blue-700',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
}

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus>('all')

  const filteredOrders = mockOrders.filter((order) => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
        <p className="text-gray-500 mt-1">Track and manage your orders</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders list */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-gray-100 p-6 mb-4">
              <ShoppingBag className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
            <p className="text-gray-500 mt-1 text-center">
              {searchQuery || statusFilter !== 'all'
                ? "Try adjusting your filters"
                : "You haven't placed any orders yet"}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button className="mt-4" asChild>
                <Link href="/shop">Start Shopping</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const status = statusConfig[order.status as keyof typeof statusConfig]
            const StatusIcon = status.icon

            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  {/* Order header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 border-b">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                        <Package className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{order.id}</p>
                        <p className="text-sm text-gray-500">
                          Placed on {formatDate(order.date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={status.color}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>
                      <span className="font-semibold text-gray-900">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  </div>

                  {/* Order items */}
                  <div className="p-4">
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-indigo-300">
                              {item.name.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-sm text-gray-500">
                              {item.dose} × {item.quantity}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-gray-900">
                            {formatPrice(item.price * item.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Tracking info */}
                    {order.tracking && (
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">Tracking:</span>
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {order.tracking}
                        </code>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex justify-end">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/shop/orders/${order.id}`}>
                          View Details
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Summary stats */}
      {mockOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-xl bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">{mockOrders.length}</p>
                <p className="text-xs text-gray-500">Total Orders</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-yellow-50">
                <p className="text-2xl font-bold text-yellow-700">
                  {mockOrders.filter(o => o.status === 'processing').length}
                </p>
                <p className="text-xs text-yellow-600">Processing</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-blue-50">
                <p className="text-2xl font-bold text-blue-700">
                  {mockOrders.filter(o => o.status === 'shipped').length}
                </p>
                <p className="text-xs text-blue-600">Shipped</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-green-50">
                <p className="text-2xl font-bold text-green-700">
                  {mockOrders.filter(o => o.status === 'delivered').length}
                </p>
                <p className="text-xs text-green-600">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
