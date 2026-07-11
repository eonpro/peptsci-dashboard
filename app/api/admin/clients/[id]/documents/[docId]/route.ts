import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING_REVIEW']).optional(),
  reviewNotes: z.string().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

/**
 * PATCH /api/admin/clients/[id]/documents/[docId] — review a document
 * (approve/reject with notes) and/or set its expiration date.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id, docId } = await params
    const parsed = reviewSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'VALIDATION_ERROR')
    const input = parsed.data

    const existing = await prisma.clientDocument.findFirst({ where: { id: docId, clientId: id } })
    if (!existing) return errorResponse('Document not found', 404, 'NOT_FOUND')

    const doc = await prisma.clientDocument.update({
      where: { id: docId },
      data: {
        ...(input.status !== undefined
          ? {
              status: input.status,
              reviewedBy: userId,
              reviewedAt: input.status === 'PENDING_REVIEW' ? null : new Date(),
            }
          : {}),
        ...(input.reviewNotes !== undefined ? { reviewNotes: input.reviewNotes } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      },
    })

    logger.info('[admin/documents] reviewed', {
      documentId: docId,
      clientId: id,
      status: doc.status,
      by: userId,
    })

    return successResponse({
      document: {
        id: doc.id,
        status: doc.status,
        reviewNotes: doc.reviewNotes,
        reviewedAt: doc.reviewedAt?.toISOString() ?? null,
        expiresAt: doc.expiresAt?.toISOString() ?? null,
      },
    })
  } catch (error) {
    logger.error('[admin/documents] patch error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update document')
  }
}
