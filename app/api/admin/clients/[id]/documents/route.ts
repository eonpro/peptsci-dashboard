import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { documentExpiryState } from '@/lib/documents'

export const dynamic = 'force-dynamic'

/** GET /api/admin/clients/[id]/documents — all documents for a practice. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const docs = await prisma.clientDocument.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse({
      documents: docs.map((doc) => ({
        id: doc.id,
        type: doc.type,
        label: doc.label,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        contentType: doc.contentType,
        status: doc.status,
        reviewNotes: doc.reviewNotes,
        reviewedAt: doc.reviewedAt?.toISOString() ?? null,
        expiresAt: doc.expiresAt?.toISOString() ?? null,
        expiryState: documentExpiryState(doc.expiresAt),
        createdAt: doc.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('[admin/clients/:id/documents] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load documents')
  }
}
