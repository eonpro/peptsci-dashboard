/**
 * One-shot SUPER_ADMIN ops: Order #340 was ingested as TB-500 10mg because the
 * Elevated Vitality Shopify line "BPC-157 10MG+TB-500 10MG BLEND" was mapped to
 * the single peptide. Remap the line (+ reservation + blend-titled mappings)
 * to BPC-TB-10.
 *
 * POST /api/admin/ops/fix-order-340  { "confirm": true }
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
import { looksLikeCompoundList } from '@/lib/products/named-blends'

export const dynamic = 'force-dynamic'

const ORDER_NUMBER = 340
const TO_SKU = 'BPC-TB-10'

function isStandaloneTb500(name: string, sku: string | null, dose: string | null): boolean {
  if (looksLikeCompoundList(name) || /bpc/i.test(name)) return false
  const skuKey = (sku || '').trim().toLowerCase()
  const named =
    /tb-?500/i.test(name) || /^tb[-_]?10(mg)?$/i.test(skuKey) || /^tb500-?10/i.test(skuKey)
  if (!named) return false
  const d = (dose || '').replace(/\s+/g, '').toLowerCase()
  return !d.includes('/') && /10(\.0)?mg/.test(d)
}

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
        shopifyConnectionId: true,
        internalNotes: true,
        client: { select: { organizationName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            variantId: true,
            variant: { select: { sku: true, dose: true, product: { select: { name: true } } } },
          },
        },
      },
    })
    if (!order) return errorResponse(`Order #${ORDER_NUMBER} not found`, 404, 'NOT_FOUND')

    const target =
      (await prisma.productVariant.findFirst({
        where: { sku: TO_SKU, status: 'ACTIVE' },
        select: { id: true, sku: true, dose: true, product: { select: { name: true } } },
      })) ||
      (await prisma.productVariant.findFirst({
        where: {
          status: 'ACTIVE',
          product: {
            AND: [
              { name: { contains: 'BPC-157', mode: 'insensitive' } },
              { name: { contains: 'TB-500', mode: 'insensitive' } },
            ],
          },
          OR: [{ dose: { contains: '10mg/10mg' } }, { dose: { contains: '10mg / 10mg' } }],
        },
        select: { id: true, sku: true, dose: true, product: { select: { name: true } } },
      }))
    if (!target) {
      return errorResponse('PeptSci BPC-157 / TB-500 10mg blend variant not found', 404, 'VARIANT_MISSING')
    }

    const tbItems = order.items.filter((it) =>
      isStandaloneTb500(it.variant.product.name, it.variant.sku, it.variant.dose)
    )
    if (tbItems.length === 0) {
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

    const noteLine = `[ops ${new Date().toISOString().slice(0, 10)}] Corrected TB-500 10mg → ${target.product.name} ${target.dose ?? ''} (${target.sku}) — Shopify blend line mapped to the single peptide.`
    const internalNotes = order.internalNotes
      ? `${order.internalNotes}\n${noteLine}`
      : noteLine

    const fromVariantIds = tbItems.map((i) => i.variantId)

    const result = await prisma.$transaction(async (tx) => {
      const updatedItems: Array<{ id: string; fromVariantId: string; toVariantId: string }> = []

      for (const item of tbItems) {
        if (item.variantId === target.id) continue

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

      const invoiceLines = await tx.invoiceLineItem.findMany({
        where: { orderId: order.id, variantId: { in: fromVariantIds } },
        select: { id: true },
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

      let mappingsFixed = 0
      if (order.shopifyConnectionId) {
        const mappingResult = await tx.shopifyVariantMapping.updateMany({
          where: {
            connectionId: order.shopifyConnectionId,
            variantId: { in: fromVariantIds },
            OR: [
              { shopifyTitle: { contains: 'BLEND', mode: 'insensitive' } },
              { shopifyTitle: { contains: '+' } },
              { shopifyTitle: { contains: 'BPC', mode: 'insensitive' } },
            ],
          },
          data: { variantId: target.id },
        })
        mappingsFixed = mappingResult.count
      }

      await tx.order.update({
        where: { id: order.id },
        data: { internalNotes },
      })

      return { updatedItems, invoiceLinesFixed: invoiceLines.length, mappingsFixed }
    })

    void writeAudit({
      clerkUserId: userId,
      entity: 'Order',
      entityId: order.id,
      action: 'ops_fix_tb500_to_bpc_tb_blend',
      metadata: {
        orderNumber: order.orderNumber,
        shopifyOrderName: order.shopifyOrderName,
        toSku: target.sku,
        toVariantId: target.id,
        ...result,
      },
    })

    logger.info('[ops] fixed order 340 TB-500 → BPC-TB blend', {
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
    logger.error('[ops fix-order-340]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to fix order 340')
  }
}
