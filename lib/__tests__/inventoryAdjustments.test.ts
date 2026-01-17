import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { adjustInventoryWithSales } from '../inventoryAdjustments.ts'
import type { Inventory, Sale } from '../sheets'

const makeInventory = (overrides: Partial<Inventory>): Inventory => ({
  SKU: overrides.SKU ?? 'SKU-1',
  MedicationName: overrides.MedicationName ?? 'Semaglutide',
  Dose: overrides.Dose ?? '10mg',
  SRP: overrides.SRP ?? 200,
  Cost: overrides.Cost ?? 50,
  InventoryOrdered: overrides.InventoryOrdered ?? 200,
  InventoryAvailable: overrides.InventoryAvailable ?? 100,
  OriginalInventoryAvailable: overrides.OriginalInventoryAvailable,
  UnitsSold: overrides.UnitsSold,
  CalculatedInventoryAvailable: overrides.CalculatedInventoryAvailable,
})

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
  PaidAmount: overrides.PaidAmount ?? 100,
  Vials: overrides.Vials ?? 5,
  AmountPerVial: overrides.AmountPerVial ?? 20,
  Product: overrides.Product ?? 'Semaglutide 10mg',
  Notes: overrides.Notes ?? 'Fulfilled',
  COGS: overrides.COGS ?? 50,
  Profit: overrides.Profit ?? 50,
  ProfitMargin: overrides.ProfitMargin ?? 50,
  Markup: overrides.Markup ?? 50,
})

describe('adjustInventoryWithSales', () => {
  test('reduces inventory based on matching product and vials', () => {
    const inventory = [
      makeInventory({ MedicationName: 'Semaglutide', Dose: '10mg', InventoryAvailable: 80 }),
      makeInventory({
        SKU: 'GHK-100',
        MedicationName: 'GHK-Cu',
        Dose: '100mg',
        InventoryAvailable: 60,
      }),
    ]

    const sales = [
      makeSale({ Product: 'Semaglutide 10mg', Vials: 30 }),
      makeSale({ Product: 'GHK-Cu 100mg', Vials: 20 }),
    ]

    const adjusted = adjustInventoryWithSales(inventory, sales)
    const sema = adjusted.find((item) => item.MedicationName === 'Semaglutide')
    const ghk = adjusted.find((item) => item.MedicationName === 'GHK-Cu')

    assert.ok(sema)
    assert.ok(ghk)
    assert.equal(sema?.InventoryAvailable, 50)
    assert.equal(ghk?.InventoryAvailable, 40)
    assert.equal(sema?.UnitsSold, 30)
    assert.equal(ghk?.UnitsSold, 20)
  })

  test('handles products with combined names and separators', () => {
    const inventory = [
      makeInventory({
        MedicationName: 'BPC-157 / TB-500',
        Dose: '10mg/10mg',
        InventoryAvailable: 40,
      }),
    ]

    const sales = [
      makeSale({ Product: 'BPC-157 / TB-500 10mg/10mg', Vials: 12 }),
      makeSale({ Product: 'BPC-157 10mg', Vials: 0 }), // Should not change inventory
    ]

    const adjusted = adjustInventoryWithSales(inventory, sales)
    const item = adjusted[0]
    assert.equal(item.InventoryAvailable, 28)
    assert.equal(item.UnitsSold, 12)
  })

  test('does not allow inventory to go below zero', () => {
    const inventory = [
      makeInventory({ MedicationName: 'Semaglutide', Dose: '5mg', InventoryAvailable: 10 }),
    ]

    const sales = [
      makeSale({ Product: 'Semaglutide 5mg', Vials: 8 }),
      makeSale({ Product: 'Semaglutide 5mg', Vials: 6 }),
    ]

    const adjusted = adjustInventoryWithSales(inventory, sales)
    const item = adjusted[0]
    assert.equal(item.InventoryAvailable, 0)
    assert.equal(item.UnitsSold, 14)
  })

  test('returns original inventory when there are no sales', () => {
    const inventory = [
      makeInventory({ MedicationName: 'Semaglutide', Dose: '5mg', InventoryAvailable: 25 }),
    ]

    const adjusted = adjustInventoryWithSales(inventory, [])
    const item = adjusted[0]
    assert.equal(item.InventoryAvailable, 25)
    assert.equal(item.UnitsSold, 0)
  })
})

