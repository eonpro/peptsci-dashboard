import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMonthlyProfitLoss, calculateYearToDateProfitLoss, calculateBalanceSheet } from '../finance.ts'
import type { Sale, Inventory } from '../sheets.ts'

const makeSale = (overrides: Partial<Sale>): Sale => ({
  Date: overrides.Date ?? new Date(),
  OrderID: overrides.OrderID ?? 'ORD-1',
  CustomerName: overrides.CustomerName ?? '',
  CustomerEmail: overrides.CustomerEmail ?? '',
  CustomerPhone: overrides.CustomerPhone ?? '',
  Address: overrides.Address ?? '',
  City: overrides.City ?? '',
  State: overrides.State ?? '',
  Zip: overrides.Zip ?? '',
  TrackingNumber: overrides.TrackingNumber ?? '',
  InvoicePaid: overrides.InvoicePaid ?? true,
  PaidAmount: overrides.PaidAmount ?? 0,
  Vials: overrides.Vials ?? 0,
  AmountPerVial: overrides.AmountPerVial ?? 0,
  Product: overrides.Product ?? 'Unknown Product',
  Notes: overrides.Notes ?? 'Fulfilled',
  COGS: overrides.COGS ?? 0,
  Profit: overrides.Profit ?? 0,
  ProfitMargin: overrides.ProfitMargin ?? 0,
  Markup: overrides.Markup ?? 0,
})

describe('finance helpers', () => {
  const sampleSales: Sale[] = [
    makeSale({
      OrderID: 'P-2025-01-001',
      Date: new Date('2025-01-05T00:00:00Z'),
      PaidAmount: 1000,
      COGS: 400,
      Vials: 10,
      Product: 'Semaglutide 10mg',
      InvoicePaid: true,
    }),
    makeSale({
      OrderID: 'P-2025-01-002',
      Date: new Date('2025-01-18T00:00:00Z'),
      PaidAmount: 500,
      COGS: 200,
      Vials: 5,
      Product: 'GHK-Cu 100mg',
      InvoicePaid: true,
    }),
    makeSale({
      OrderID: 'P-2025-02-001',
      Date: new Date('2025-02-02T00:00:00Z'),
      PaidAmount: 1200,
      COGS: 500,
      Vials: 12,
      Product: 'Semaglutide 10mg',
      InvoicePaid: false, // cash received, invoice flag missing
    }),
    makeSale({
      OrderID: 'P-2025-02-002',
      Date: new Date('2025-02-10T00:00:00Z'),
      PaidAmount: 0,
      COGS: 0,
      Vials: 0,
      Product: 'Tirzepatide 60mg',
      InvoicePaid: true,
    }),
  ]

  type DistributorOrder = Parameters<typeof calculateBalanceSheet>[1][number]

  const sampleInventory: Inventory[] = [
    {
      SKU: 'SEM-10',
      MedicationName: 'Semaglutide',
      Dose: '10mg',
      SRP: 200,
      Cost: 40,
      InventoryOrdered: 200,
      InventoryAvailable: 80,
    },
    {
      SKU: 'GHK-100',
      MedicationName: 'GHK-Cu',
      Dose: '100mg',
      SRP: 150,
      Cost: 35,
      InventoryOrdered: 150,
      InventoryAvailable: 60,
    },
  ]

  const sampleOrders: DistributorOrder[] = [
    {
      id: 'DO-20250101-001',
      orderDate: new Date('2025-01-02T00:00:00Z'),
      vendor: 'Distributor',
      products: [
        { name: 'Semaglutide', dose: '10mg', quantity: 50, unitCost: 40, total: 2000 },
      ],
      subtotal: 2000,
      shipping: 150,
      paypalFee: 60,
      total: 2210,
      status: 'delivered',
      trackingNumber: 'TRK1',
    },
    {
      id: 'DO-20241215-001',
      orderDate: new Date('2024-12-15T00:00:00Z'),
      vendor: 'Distributor',
      products: [
        { name: 'GHK-Cu', dose: '100mg', quantity: 40, unitCost: 35, total: 1400 },
      ],
      subtotal: 1400,
      shipping: 100,
      paypalFee: 40,
      total: 1540,
      status: 'delivered',
      trackingNumber: 'TRK2',
    },
  ]

  test('calculateMonthlyProfitLoss groups paid sales by month', () => {
    const monthly = calculateMonthlyProfitLoss(sampleSales)
    assert.equal(monthly.length, 2)

    const jan = monthly.find((m) => m.monthKey === '2025-01')
    assert.ok(jan, 'January summary expected')
    assert.equal(jan?.revenue, 1500)
    assert.equal(jan?.cogs, 600)
    assert.equal(jan?.grossProfit, 900)
    assert.equal(jan?.orderCount, 2)
    const janProduct = jan?.productBreakdown.find((p) => p.product === 'Semaglutide 10mg')
    assert.equal(janProduct?.revenue, 1000)

    const feb = monthly.find((m) => m.monthKey === '2025-02')
    assert.ok(feb, 'February summary expected despite missing invoice flag')
    assert.equal(feb?.revenue, 1200)
    assert.equal(feb?.cogs, 500)
    assert.equal(feb?.orderCount, 1)
  })

  test('calculateYearToDateProfitLoss aggregates months up to provided period', () => {
    const ytd = calculateYearToDateProfitLoss(sampleSales, 2025, 2)
    assert.ok(ytd)
    assert.equal(ytd?.revenue, 2700)
    assert.equal(ytd?.cogs, 1100)
    assert.equal(ytd?.grossProfit, 1600)
    assert.equal(ytd?.monthsIncluded.length, 2)
    assert.equal(ytd?.orderCount, 3) // only paid orders counted
  })

  test('calculateBalanceSheet summarizes inventory and spend', () => {
    const summary = calculateBalanceSheet(sampleInventory, sampleOrders, { year: 2025, asOf: new Date('2025-01-31') })
    assert.equal(Math.round(summary.inventory.totalInventoryValue), 5300) // (80*40)+(60*35)=5300
    assert.equal(summary.inventory.totalOnHandUnits, 140)
    assert.equal(summary.spendAllTime.totalSpend, 3750) // 2210 + 1540
    assert.equal(summary.spendYTD?.totalSpend, 2210)
    assert.equal(summary.spendYTD?.orders, 1)
  })
})

