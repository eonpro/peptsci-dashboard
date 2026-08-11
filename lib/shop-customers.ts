/**
 * Clinic Customers CRM — patients with ship-to + their PeptSci orders
 * (Shopify white-label and patient-shipped shop orders).
 */

import { prisma } from '@/lib/prisma'
import { displayProductName } from '@/lib/products/named-blends'

export type ShopCustomerListItem = {
  id: string
  firstName: string
  lastName: string
  displayName: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  orderCount: number
  lastOrderAt: string | null
}

export type ShopCustomerOrder = {
  id: string
  orderNumber: number
  status: string
  shippingStatus: string | null
  total: number
  source: string
  shopifyOrderName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  createdAt: string
  items: Array<{ name: string; dose: string | null; quantity: number }>
}

export type ShopCustomerDetail = ShopCustomerListItem & {
  address: {
    address1?: string
    address2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  } | null
  notes: string | null
  orders: ShopCustomerOrder[]
}

function addrField(address: unknown, key: string): string | null {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null
  const v = (address as Record<string, unknown>)[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export async function listShopCustomers(clientId: string): Promise<ShopCustomerListItem[]> {
  if (!prisma) throw new Error('Database not connected')

  const patients = await prisma.patient.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      orders: {
        where: { status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      _count: { select: { orders: { where: { status: { not: 'DRAFT' } } } } },
    },
  })

  const withOrders = patients.filter((p) => p._count.orders > 0)
  const withoutOrders = patients.filter((p) => p._count.orders === 0)
  const ordered = [...withOrders, ...withoutOrders]

  return ordered.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: `${p.firstName} ${p.lastName}`.replace(/\s+—\s*$/, '').trim(),
    email: p.email,
    phone: p.phone,
    city: addrField(p.address, 'city'),
    state: addrField(p.address, 'state'),
    orderCount: p._count.orders,
    lastOrderAt: p.orders[0]?.createdAt.toISOString() ?? null,
  }))
}

export async function getShopCustomer(
  clientId: string,
  patientId: string
): Promise<ShopCustomerDetail | null> {
  if (!prisma) throw new Error('Database not connected')

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clientId, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      notes: true,
      orders: {
        where: { status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          shippingStatus: true,
          total: true,
          source: true,
          shopifyOrderName: true,
          trackingNumber: true,
          trackingUrl: true,
          createdAt: true,
          items: {
            select: {
              quantity: true,
              variant: {
                select: { dose: true, sku: true, product: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  })
  if (!patient) return null

  const addr =
    patient.address && typeof patient.address === 'object' && !Array.isArray(patient.address)
      ? (patient.address as ShopCustomerDetail['address'])
      : null

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    displayName: `${patient.firstName} ${patient.lastName}`.replace(/\s+—\s*$/, '').trim(),
    email: patient.email,
    phone: patient.phone,
    city: addrField(patient.address, 'city'),
    state: addrField(patient.address, 'state'),
    orderCount: patient.orders.length,
    lastOrderAt: patient.orders[0]?.createdAt.toISOString() ?? null,
    address: addr,
    notes: patient.notes,
    orders: patient.orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      shippingStatus: o.shippingStatus,
      total: Number(o.total),
      source: o.source,
      shopifyOrderName: o.shopifyOrderName,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        name: displayProductName(it.variant.product.name, it.variant.sku),
        dose: it.variant.dose,
        quantity: it.quantity,
      })),
    })),
  }
}
