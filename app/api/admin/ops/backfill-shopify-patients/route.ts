/**
 * SUPER_ADMIN ops: link SHOPIFY orders missing patientId to Patients
 * created from shippingAddress + buyer email (inbound notes / buyerEmail).
 *
 * POST /api/admin/ops/backfill-shopify-patients
 *   {} or { "dryRun": true } → candidates
 *   { "confirm": true } → upsert patients + set Order.patientId
 *   optional { "clientId": "..." } to scope
 */

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import {
  enrichShippingAddressWithBuyer,
  upsertPatientFromShipTo,
} from '@/lib/patients/upsert-from-ship-to'

export const dynamic = 'force-dynamic'

function emailFromInternalNotes(notes: string | null): string | null {
  if (!notes) return null
  const m = notes.match(/buyer:\s*([^\s|]+)/i)
  return m?.[1]?.trim().toLowerCase() || null
}

export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated, isSuperAdmin } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isSuperAdmin) return forbiddenResponse('Super admin required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean
      confirm?: boolean
      clientId?: string
    }
    const dryRun = body.confirm !== true
    const clientId = body.clientId?.trim() || undefined

    const orders = await prisma.order.findMany({
      where: {
        source: 'SHOPIFY',
        patientId: null,
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        clientId: true,
        shippingAddress: true,
        internalNotes: true,
        shopifyOrderName: true,
        shopifyInbound: { select: { buyerEmail: true, shippingAddress: true } },
        client: { select: { organizationName: true } },
      },
    })

    const withShipTo = orders.filter((o) => {
      const addr = o.shippingAddress ?? o.shopifyInbound?.shippingAddress
      return addr && typeof addr === 'object' && !Array.isArray(addr)
    })

    const planned: Array<{
      orderId: string
      orderNumber: number
      organizationName: string
      shopifyOrderName: string | null
      buyerEmail: string | null
    }> = []

    const results: Array<{
      orderId: string
      orderNumber: number
      patientId: string | null
      status: string
    }> = []

    for (const o of withShipTo) {
      const buyerEmail =
        o.shopifyInbound?.buyerEmail?.trim() || emailFromInternalNotes(o.internalNotes)
      planned.push({
        orderId: o.id,
        orderNumber: o.orderNumber,
        organizationName: o.client.organizationName,
        shopifyOrderName: o.shopifyOrderName,
        buyerEmail,
      })

      if (dryRun) continue

      const shippingAddress = enrichShippingAddressWithBuyer(
        o.shippingAddress ?? o.shopifyInbound?.shippingAddress,
        buyerEmail
      )
      try {
        const patientId = await upsertPatientFromShipTo({
          clientId: o.clientId,
          shippingAddress,
          buyerEmail,
        })
        if (!patientId) {
          results.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            patientId: null,
            status: 'skipped_no_ship_to',
          })
          continue
        }
        await prisma.order.update({
          where: { id: o.id },
          data: {
            patientId,
            shippingAddress: (shippingAddress as Prisma.InputJsonValue) ?? undefined,
            shipTo: 'PATIENT',
          },
        })
        results.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          patientId,
          status: 'linked',
        })
      } catch (err) {
        results.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          patientId: null,
          status: err instanceof Error ? err.message : 'error',
        })
      }
    }

    if (!dryRun) {
      void writeAudit({
        clerkUserId: userId,
        entity: 'Order',
        entityId: clientId ?? 'all',
        action: 'ops_backfill_shopify_patients',
        metadata: { linked: results.filter((r) => r.status === 'linked').length },
      })
    }

    logger.info('[ops] backfill-shopify-patients', {
      dryRun,
      candidates: planned.length,
      linked: results.filter((r) => r.status === 'linked').length,
    })

    return successResponse({
      dryRun,
      candidates: planned.length,
      planned: dryRun ? planned : undefined,
      results: dryRun ? undefined : results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[ops backfill-shopify-patients]', { message }, error instanceof Error ? error : undefined)
    return errorResponse(message, 500, 'BACKFILL_FAILED')
  }
}
