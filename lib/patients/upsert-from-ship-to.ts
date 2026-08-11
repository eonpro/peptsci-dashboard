/**
 * Upsert a clinic Patient from a Shopify (or similar) ship-to address.
 * Used when queuing white-label fulfillment so the portal Customers tab
 * and order.patientId stay in sync.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type ShipToLike = {
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  first_name?: string | null
  last_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  company?: string | null
}

function trim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : ''
}

export function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return { firstName: 'Customer', lastName: 'Unknown' }
  const parts = name.split(' ')
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '—' }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}

export function personNameFromShipTo(addr: ShipToLike | null | undefined): {
  firstName: string
  lastName: string
  displayName: string
} {
  if (!addr) return { firstName: 'Customer', lastName: 'Unknown', displayName: 'Customer Unknown' }
  const fromParts = [trim(addr.firstName) || trim(addr.first_name), trim(addr.lastName) || trim(addr.last_name)]
    .filter(Boolean)
    .join(' ')
  const display = trim(addr.name) || fromParts || trim(addr.company) || 'Customer'
  const split = splitPersonName(display)
  return { ...split, displayName: display }
}

function patientAddressJson(addr: ShipToLike): Prisma.InputJsonValue {
  return {
    address1: trim(addr.address1) || '—',
    ...(trim(addr.address2) ? { address2: trim(addr.address2) } : {}),
    city: trim(addr.city) || '—',
    state: trim(addr.state) || '—',
    zip: trim(addr.zip) || '00000',
    country: trim(addr.country) || 'US',
  }
}

export function enrichShippingAddressWithBuyer(
  shippingAddress: unknown,
  buyerEmail?: string | null
): Record<string, unknown> | null {
  if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
    if (buyerEmail?.trim()) return { email: buyerEmail.trim().toLowerCase() }
    return null
  }
  const base = { ...(shippingAddress as Record<string, unknown>) }
  const email = trim(buyerEmail) || trim(base.email)
  if (email) base.email = email.toLowerCase()
  return base
}

/**
 * Find or create a Patient for this ship-to. Returns null if prisma missing
 * or there is no usable address/name signal at all.
 */
export async function upsertPatientFromShipTo(params: {
  clientId: string
  shippingAddress: unknown
  buyerEmail?: string | null
}): Promise<string | null> {
  if (!prisma) return null

  const raw =
    params.shippingAddress &&
    typeof params.shippingAddress === 'object' &&
    !Array.isArray(params.shippingAddress)
      ? (params.shippingAddress as ShipToLike)
      : null

  const email = (trim(params.buyerEmail) || trim(raw?.email)).toLowerCase() || null
  const phone = trim(raw?.phone) || null
  const { firstName, lastName, displayName } = personNameFromShipTo(raw)

  const hasAddress = Boolean(trim(raw?.address1) || trim(raw?.city) || trim(raw?.zip))
  if (!hasAddress && !email && displayName === 'Customer') return null

  const address = patientAddressJson(raw ?? {})
  const zip = trim(raw?.zip)

  if (email) {
    const byEmail = await prisma.patient.findFirst({
      where: {
        clientId: params.clientId,
        isActive: true,
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (byEmail) {
      await prisma.patient.update({
        where: { id: byEmail.id },
        data: {
          firstName,
          lastName,
          address,
          ...(phone ? { phone } : {}),
          email,
        },
      })
      return byEmail.id
    }
  }

  if (firstName && lastName && zip) {
    const byNameZip = await prisma.patient.findFirst({
      where: {
        clientId: params.clientId,
        isActive: true,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true, address: true },
    })
    if (byNameZip) {
      const existingZip =
        byNameZip.address &&
        typeof byNameZip.address === 'object' &&
        !Array.isArray(byNameZip.address)
          ? trim((byNameZip.address as ShipToLike).zip)
          : ''
      if (!existingZip || existingZip === zip || existingZip.slice(0, 5) === zip.slice(0, 5)) {
        await prisma.patient.update({
          where: { id: byNameZip.id },
          data: {
            address,
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
          },
        })
        return byNameZip.id
      }
    }
  }

  const created = await prisma.patient.create({
    data: {
      clientId: params.clientId,
      firstName,
      lastName,
      address,
      phone,
      email,
      notes: 'Created from Shopify ship-to',
    },
    select: { id: true },
  })
  return created.id
}
