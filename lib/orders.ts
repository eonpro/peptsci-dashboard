import { fetchRange, coerceCurrency, coerceInt } from './sheets'

export interface DistributorOrder {
  id: string
  orderDate: Date | null
  vendor: string
  products: {
    name: string
    dose: string
    quantity: number
    unitCost: number
    total: number
  }[]
  subtotal: number
  shipping: number
  paypalFee: number
  total: number
  status: 'pending' | 'shipped' | 'delivered'
  trackingNumber?: string
}

export async function getDistributorOrders(): Promise<DistributorOrder[]> {
  try {
    // Note: Sheet name has a space and forward slash which needs proper handling
    const rows = await fetchRange("'Orders /Expenses'!A:H")

    console.log(`Fetched ${rows.length} rows from Orders/Expenses sheet`)

    if (rows.length === 0) return []

    const orders: DistributorOrder[] = []
    let currentOrder: DistributorOrder | null = null
    let orderCounter = 1

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]

      // Skip empty rows
      if (!row || row.length === 0 || !row.some((cell) => cell && cell.trim())) {
        continue
      }

      // Check if this is a new order (has a date in column B and amount in column C)
      if (row[1] && row[1].toString().includes('/') && row[2] && row[2].toString().includes('$')) {
        // Save previous order if exists
        if (currentOrder) {
          // Calculate subtotal from products
          currentOrder.subtotal = currentOrder.products.reduce((sum, p) => sum + p.total, 0)
          orders.push(currentOrder)
        }

        // Start new order
        const dateStr = row[1]
        const dateParts = dateStr.split('/')
        let orderDate = null
        if (dateParts.length === 3) {
          const month = parseInt(dateParts[0], 10)
          const day = parseInt(dateParts[1], 10)
          const year = parseInt(dateParts[2], 10)
          orderDate = new Date(year, month - 1, day)
        }

        const total = coerceCurrency(row[2])

        currentOrder = {
          id: `DO-${dateStr.replace(/\//g, '')}-${orderCounter.toString().padStart(3, '0')}`,
          orderDate,
          vendor: 'Distributor', // Default vendor since not in the data
          products: [],
          subtotal: 0,
          shipping: 0,
          paypalFee: 0,
          total,
          status: 'delivered', // Default status
        }
        orderCounter++
      }
      // Check if this is a product row (has product name in column D)
      else if (
        currentOrder &&
        row[3] &&
        !['Shipping', 'Paypal Fee', 'PayPal Fee'].includes(row[3])
      ) {
        const productName = row[3].trim()
        const dose = row[4] || ''
        const quantity = coerceInt(row[5])
        const unitCost = coerceCurrency(row[6])
        const total = coerceCurrency(row[7])

        // Only add if it's a valid product
        if (productName && quantity > 0) {
          currentOrder.products.push({
            name: productName,
            dose,
            quantity,
            unitCost,
            total: total || quantity * unitCost,
          })
        }
      }
      // Check if this is shipping
      else if (currentOrder && row[3] && row[3].toLowerCase().includes('shipping')) {
        currentOrder.shipping = coerceCurrency(row[7])
      }
      // Check if this is PayPal fee
      else if (currentOrder && row[3] && row[3].toLowerCase().includes('paypal')) {
        currentOrder.paypalFee = coerceCurrency(row[7])
      }
    }

    // Add the last order if exists
    if (currentOrder) {
      currentOrder.subtotal = currentOrder.products.reduce((sum, p) => sum + p.total, 0)
      orders.push(currentOrder)
    }

    // Sort orders by date (newest first)
    orders.sort((a, b) => {
      if (!a.orderDate || !b.orderDate) return 0
      return b.orderDate.getTime() - a.orderDate.getTime()
    })

    return orders
  } catch (error) {
    console.error('Error fetching distributor orders:', error)
    return []
  }
}
