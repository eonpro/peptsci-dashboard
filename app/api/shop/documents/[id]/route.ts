import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { deleteObject } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/shop/documents/[id] — a client may remove their own document
 * only while it is awaiting review. Approved/rejected documents are part of
 * the compliance record and can only be replaced by a new upload.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const doc = await prisma.clientDocument.findFirst({ where: { id, clientId } })
    if (!doc) return errorResponse('Document not found', 404, 'NOT_FOUND')
    if (doc.status !== 'PENDING_REVIEW') {
      return errorResponse(
        'Reviewed documents cannot be deleted. Upload a replacement instead.',
        409,
        'ALREADY_REVIEWED'
      )
    }

    await prisma.clientDocument.delete({ where: { id: doc.id } })
    await deleteObject({ url: doc.fileUrl }).catch(() => {})

    return successResponse({ deleted: true })
  } catch (error) {
    logger.error('[shop/documents/:id] delete error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to delete document')
  }
}
