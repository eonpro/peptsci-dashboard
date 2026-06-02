import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { deleteObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  trackingNumber: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
  orderRef: z.string().trim().min(1).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const body = await request.json()
    const input = patchSchema.parse(body)

    const existing = await prisma.packagePhoto.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return errorResponse('Package photo not found', 404, 'NOT_FOUND')

    const data: Record<string, unknown> = {}
    if (input.notes !== undefined) data.notes = input.notes
    if (input.trackingNumber !== undefined) {
      data.trackingNumber = input.trackingNumber
      data.trackingSource = 'manual'
    }

    // Re-match against an order if a new orderRef is supplied.
    if (input.orderRef !== undefined) {
      data.orderRef = input.orderRef
      const asNumber = Number(input.orderRef.replace(/^#/, ''))
      const order = Number.isInteger(asNumber)
        ? await prisma.order.findFirst({ where: { orderNumber: asNumber }, select: { id: true, clientId: true } })
        : null
      data.orderId = order?.id ?? null
      data.clientId = order?.clientId ?? null
      data.matched = !!order
      data.matchedAt = order ? new Date() : null
    }

    const updated = await prisma.packagePhoto.update({
      where: { id },
      data,
      select: { id: true, orderRef: true, trackingNumber: true, matched: true, notes: true },
    })

    logger.info('[PackagePhoto] updated', { id, fields: Object.keys(data) })
    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Invalid input', 400, 'VALIDATION_ERROR')
    }
    logger.error('[PackagePhoto PATCH] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update package photo')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const existing = await prisma.packagePhoto.findUnique({ where: { id }, select: { id: true, blobUrl: true } })
    if (!existing) return errorResponse('Package photo not found', 404, 'NOT_FOUND')

    if (existing.blobUrl) {
      await deleteObject({ url: existing.blobUrl }).catch(() => {})
    }
    await prisma.packagePhoto.delete({ where: { id } })

    logger.info('[PackagePhoto] deleted', { id })
    return successResponse({ id, deleted: true })
  } catch (error) {
    logger.error('[PackagePhoto DELETE] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to delete package photo')
  }
}
