import { Sale } from './sales'
import { Inventory } from './inventory'
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { nyDayString, nyMonthKey } from './reports/core'

/** Normalize a Sale date (Date at runtime, ISO string after JSON round-trips). */
const toDateObj = (d: Date | string): Date => (d instanceof Date ? d : new Date(d))

interface SalesKPIs {
  totalSales: number
  mtdSales: number
  totalOrders: number
  uniqueClients: number
  avgOrderValue: number
}

interface CustomerMetrics {
  email: string
  name: string
  phone: string
  city: string
  state: string
  lifetimeSpend: number
  totalOrders: number
  lastOrderDate: Date | null
  avgOrderValue: number
  orders: Sale[]
}

interface ProductMetrics {
  product: string
  totalRevenue: number
  totalVials: number
  avgPricePerVial: number
  orderCount: number
}

interface InventoryMetrics {
  totalValue: number
  totalItems: number
  lowStockItems: Array<{
    name: string
    available: number
    srp: number
  }>
}

// Calculate total sales KPIs
export function getTotals(sales: Sale[]): SalesKPIs {
  // Use the actual current month (November 2025)
  const now = toZonedTime(new Date(), 'America/New_York')
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  let totalSales = 0
  let mtdSales = 0
  const uniqueEmails = new Set<string>()
  const uniquePhones = new Set<string>()

  // Track unique orders by customer+date combination
  const uniqueOrders = new Set<string>()

  sales.forEach((sale) => {
    totalSales += sale.PaidAmount

    // Check if sale is in current month (November 2025)
    if (sale.Date && isWithinInterval(sale.Date, { start: monthStart, end: monthEnd })) {
      mtdSales += sale.PaidAmount
    }

    if (sale.CustomerEmail) {
      uniqueEmails.add(sale.CustomerEmail.toLowerCase())
    } else if (sale.CustomerPhone) {
      uniquePhones.add(sale.CustomerPhone)
    }

    // Create unique order key: customer identifier + date
    if (sale.Date && (sale.CustomerEmail || sale.CustomerName)) {
      const customerKey = sale.CustomerEmail?.toLowerCase() || sale.CustomerName.toLowerCase()
      // Bucket by the America/New_York calendar day, not UTC.
      const dateKey = nyDayString(toDateObj(sale.Date))
      const orderKey = `${customerKey}_${dateKey}`
      uniqueOrders.add(orderKey)
    }
  })

  const totalOrders = uniqueOrders.size
  const uniqueClients =
    uniqueEmails.size +
    Array.from(uniquePhones).filter(
      (phone) =>
        !Array.from(uniqueEmails).some((email) =>
          sales.find((s) => s.CustomerEmail?.toLowerCase() === email && s.CustomerPhone === phone)
        )
    ).length

  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

  return {
    totalSales,
    mtdSales,
    totalOrders,
    uniqueClients,
    avgOrderValue,
  }
}

// Group sales by product
export function groupByProduct(sales: Sale[]): ProductMetrics[] {
  const productMap = new Map<string, ProductMetrics>()
  const productOrders = new Map<string, Set<string>>() // Track unique orders per product

  sales.forEach((sale) => {
    const product = sale.Product || 'Unknown'

    if (!productMap.has(product)) {
      productMap.set(product, {
        product,
        totalRevenue: 0,
        totalVials: 0,
        avgPricePerVial: 0,
        orderCount: 0,
      })
      productOrders.set(product, new Set())
    }

    const metrics = productMap.get(product)!
    metrics.totalRevenue += sale.PaidAmount
    metrics.totalVials += sale.Vials

    // Track unique orders (customer+date) for this product
    if (sale.Date && (sale.CustomerEmail || sale.CustomerName)) {
      const customerKey = sale.CustomerEmail?.toLowerCase() || sale.CustomerName.toLowerCase()
      const dateKey = nyDayString(toDateObj(sale.Date))
      const orderKey = `${customerKey}_${dateKey}`
      productOrders.get(product)!.add(orderKey)
    }

    metrics.avgPricePerVial = metrics.totalVials > 0 ? metrics.totalRevenue / metrics.totalVials : 0

    productMap.set(product, metrics)
  })

  // Set the correct order count for each product
  productMap.forEach((metrics, product) => {
    metrics.orderCount = productOrders.get(product)?.size || 0
  })

  return Array.from(productMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
}

// Group sales by customer
export function groupByCustomer(sales: Sale[]): CustomerMetrics[] {
  const customerMap = new Map<string, CustomerMetrics>()

  sales.forEach((sale) => {
    const email = sale.CustomerEmail?.trim()
    const phoneDigits = sale.CustomerPhone?.replace(/\D/g, '')
    const name = sale.CustomerName?.trim()

    let key: string
    if (email) {
      key = `email:${email.toLowerCase()}`
    } else if (phoneDigits) {
      key = `phone:${phoneDigits}`
    } else if (name) {
      key = `name:${name.toLowerCase()}`
    } else {
      key = `order:${sale.OrderID}`
    }

    const displayName =
      name ||
      (email
        ? email.split('@')[0]
        : phoneDigits
          ? `Client ${phoneDigits.slice(-4)}`
          : 'Unknown Customer')

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        email: email || '',
        name: displayName,
        phone: sale.CustomerPhone || '',
        city: sale.City || '',
        state: sale.State || '',
        lifetimeSpend: 0,
        totalOrders: 0,
        lastOrderDate: null,
        avgOrderValue: 0,
        orders: [],
      })
    }

    const metrics = customerMap.get(key)!
    metrics.lifetimeSpend += sale.PaidAmount
    metrics.orders.push(sale)

    if (sale.Date) {
      if (!metrics.lastOrderDate || sale.Date > metrics.lastOrderDate) {
        metrics.lastOrderDate = sale.Date
      }
    }

    customerMap.set(key, metrics)
  })

  // Now calculate unique orders per customer (by date)
  customerMap.forEach((metrics) => {
    const uniqueOrderDates = new Set<string>()

    metrics.orders.forEach((sale) => {
      if (sale.Date) {
        uniqueOrderDates.add(nyDayString(toDateObj(sale.Date)))
      }
    })

    metrics.totalOrders = uniqueOrderDates.size
    metrics.avgOrderValue =
      metrics.totalOrders > 0 ? metrics.lifetimeSpend / metrics.totalOrders : 0
  })

  return Array.from(customerMap.values()).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
}

// Get daily revenue for current month
export function getDailyRevenue(sales: Sale[]): Array<{
  date: string
  revenue: number
}> {
  // Use the actual current month (November 2025)
  const now = toZonedTime(new Date(), 'America/New_York')
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const dailyMap = new Map<string, number>()

  sales.forEach((sale) => {
    // Check if sale is in current month (November 2025)
    if (sale.Date && isWithinInterval(sale.Date, { start: monthStart, end: monthEnd })) {
      const dateKey = nyDayString(toDateObj(sale.Date))
      const current = dailyMap.get(dateKey) || 0
      dailyMap.set(dateKey, current + sale.PaidAmount)
    }
  })

  const dailyRevenue = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return dailyRevenue
}

// Calculate inventory metrics
export function getInventoryMetrics(inventory: Inventory[]): InventoryMetrics {
  const LOW_STOCK_THRESHOLD = 10

  let totalValue = 0
  const lowStockItems: Array<{
    name: string
    available: number
    srp: number
  }> = []

  inventory.forEach((item) => {
    const value = item.SRP * item.InventoryAvailable
    totalValue += value

    if (item.InventoryAvailable <= LOW_STOCK_THRESHOLD) {
      lowStockItems.push({
        name: item.MedicationName,
        available: item.InventoryAvailable,
        srp: item.SRP,
      })
    }
  })

  return {
    totalValue,
    totalItems: inventory.length,
    lowStockItems,
  }
}

// Get customer by identifier (email or slug)
export function getCustomerById(sales: Sale[], id: string): CustomerMetrics | null {
  const customers = groupByCustomer(sales)

  // Try to find by email first
  const byEmail = customers.find((c) => c.email?.toLowerCase() === id.toLowerCase())
  if (byEmail) return byEmail

  // Try to find by normalized slug
  const normalizedId = id.toLowerCase()
  return (
    customers.find((c) => {
      const slug =
        c.email?.toLowerCase() || `${c.phone}_${c.name}`.toLowerCase().replace(/[^a-z0-9_]/g, '-')
      return slug === normalizedId
    }) || null
  )
}

// Get month over month sales data
export function getMonthOverMonthSales(sales: Sale[]): Array<{
  month: string
  sales: number
  orders: number
}> {
  const monthlyData = new Map<string, { sales: number; orders: Set<string> }>()

  sales.forEach((sale) => {
    if (!sale.Date) return

    // Bucket by the America/New_York calendar month.
    const monthKey = nyMonthKey(toDateObj(sale.Date))

    // Get or create month data
    let monthData = monthlyData.get(monthKey)
    if (!monthData) {
      monthData = { sales: 0, orders: new Set() }
      monthlyData.set(monthKey, monthData)
    }

    // Add sales
    monthData.sales += sale.PaidAmount

    // Track unique order (customer + NY calendar day combination)
    const customerKey = sale.CustomerEmail?.toLowerCase() || sale.CustomerName.toLowerCase()
    const dateKey = nyDayString(toDateObj(sale.Date))
    const orderKey = `${customerKey}_${dateKey}`
    monthData.orders.add(orderKey)
  })

  // Convert to array and sort by month
  const result = Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      sales: data.sales,
      orders: data.orders.size,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Keep only last 12 months
  return result.slice(-12)
}
