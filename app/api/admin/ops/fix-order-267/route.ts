/**
 * One-shot SUPER_ADMIN ops: Order #267 (Shopify #1284) had LL-37 from a bad
 * RT-20 Shopify mapping. Correct the line item (+ reservation) to Retatrutide 20mg.
 *
 * POST /api/admin/ops/fix-order-267  { "confirm": true }
 */

import { NextRequest } from 'next/server'
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

export const dynamic = 'force-dynamic'

const ORDER_NUMBER = 267
const FROM_SKUS = new Set(['375', 'LL37-5', 'LL-37']) // PeptSci LL-37 SKU is "375"
const TO_SKU = 'RT20'

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, isSuperAdmin, userId } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !isSuperAdmin) return forbiddenResponse('Super admin required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const body = await request.json().catch(() => null)
    if (!body || body.confirm !== true) {
      return errorResponse('Pass { "confirm": true } to apply', 400, 'CONFIRM_REQUIRED')
    }

    const order = await prisma.order.findFirst({
      where: { orderNumber: ORDER_NUMBER },
      select: {
        id: true,
        orderNumber: true,
        shopifyOrderName: true,
        internalNotes: true,
        client: { select: { organizationName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            variantId: true,
            variant: { select: { sku: true, dose: true, product: { select: { name: true } } } },
          },
        },
      },
    })
    if (!order) return errorResponse(`Order #${ORDER_NUMBER} not found`, 404, 'NOT_FOUND')

    const target = await prisma.productVariant.findFirst({
      where: { sku: TO_SKU, status: 'ACTIVE' },
      select: {
        id: true,
        sku: true,
        dose: true,
        product: { select: { name: true } },
      },
    })
    if (!target) return errorResponse(`PeptSci variant ${TO_SKU} not found`, 404, 'VARIANT_MISSING')

    const llItems = order.items.filter((it) => {
      const sku = (it.variant.sku || '').trim()
      const name = it.variant.product.name || ''
      return FROM_SKUS.has(sku) || /ll-?37/i.test(name)
    })
    if (llItems.length === 0) {
      return successResponse({
        alreadyFixed: true,
        orderNumber: order.orderNumber,
        shopifyOrderName: order.shopifyOrderName,
        items: order.items.map((it) => ({
          id: it.id,
          sku: it.variant.sku,
          name: it.variant.product.name,
          dose: it.variant.dose,
          quantity: it.quantity,
        })),
      })
    }

    const noteLine = `[ops ${new Date().toISOString().slice(0, 10)}] Corrected LL-37 → Retatrutide 20mg (${TO_SKU}) — bad Shopify RT-20 mapping on ingest.`
    const internalNotes = order.internalNotes
      ? `${order.internalNotes}\n${noteLine}`
      : noteLine

    const result = await prisma.$transaction(async (tx) => {
      const updatedItems: Array<{ id: string; fromVariantId: string; toVariantId: string }> = []

      for (const item of llItems) {
        if (item.variantId === target.id) continue

        // Reservations are unique on (orderId, variantId). Move carefully.
        const fromRes = await tx.inventoryReservation.findUnique({
          where: { orderId_variantId: { orderId: order.id, variantId: item.variantId } },
        })
        const toRes = await tx.inventoryReservation.findUnique({
          where: { orderId_variantId: { orderId: order.id, variantId: target.id } },
        })

        if (fromRes && toRes) {
          await tx.inventoryReservation.update({
            where: { id: toRes.id },
            data: {
              quantity: toRes.quantity + fromRes.quantity,
              orderItemId: toRes.orderItemId ?? item.id,
            },
          })
          await tx.inventoryReservation.delete({ where: { id: fromRes.id } })
        } else if (fromRes) {
          await tx.inventoryReservation.update({
            where: { id: fromRes.id },
            data: { variantId: target.id, orderItemId: item.id },
          })
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { variantId: target.id },
        })
        updatedItems.push({
          id: item.id,
          fromVariantId: item.variantId,
          toVariantId: target.id,
        })
      }

      // Also fix invoice lines linked to this order that still say LL-37 / wrong variant.
      const invoiceLines = await tx.invoiceLineItem.findMany({
        where: { orderId: order.id, variantId: { in: llItems.map((i) => i.variantId) } },
        select: { id: true, description: true, variantId: true },
      })
      for (const line of invoiceLines) {
        await tx.invoiceLineItem.update({
          where: { id: line.id },
          data: {
            variantId: target.id,
            description: `${target.product.name}${target.dose ? ` ${target.dose}` : ''}${
              target.sku ? ` · ${target.sku}` : ''
            }`,
          },
        })
      }

      await tx.order.update({
        where: { id: order.id },
        data: { internalNotes },
      })

      return { updatedItems, invoiceLinesFixed: invoiceLines.length }
    })

    void writeAudit({
      clerkUserId: userId,
      entity: 'Order',
      entityId: order.id,
      action: 'ops_fix_ll37_to_reta20',
      metadata: {
        orderNumber: order.orderNumber,
        shopifyOrderName: order.shopifyOrderName,
        toSku: TO_SKU,
        toVariantId: target.id,
        ...result,
      },
    })

    logger.info('[ops] fixed order 267 LL-37 → RT20', {
      orderId: order.id,
      updated: result.updatedItems.length,
    })

    const refreshed = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        items: {
          select: {
            quantity: true,
            variant: { select: { sku: true, dose: true, product: { select: { name: true } } } },
          },
        },
      },
    })

    return successResponse({
      fixed: true,
      orderNumber: order.orderNumber,
      shopifyOrderName: order.shopifyOrderName,
      client: order.client.organizationName,
      to: {
        sku: target.sku,
        name: target.product.name,
        dose: target.dose,
      },
      ...result,
      itemsAfter: refreshed?.items.map((it) => ({
        qty: it.quantity,
        name: it.variant.product.name,
        dose: it.variant.dose,
        sku: it.variant.sku,
      })),
    })
  } catch (error) {
    logger.error('[ops fix-order-267]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to fix order 267')
  }
}
