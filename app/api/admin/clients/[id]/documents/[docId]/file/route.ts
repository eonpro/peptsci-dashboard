import { NextRequest, NextResponse } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — auth-gated file proxy for admin document review. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id, docId } = await params
    const doc = await prisma.clientDocument.findFirst({ where: { id: docId, clientId: id } })
    if (!doc) return errorResponse('Document not found', 404, 'NOT_FOUND')

    const obj = await getObject({
      url: doc.fileUrl,
      base64: doc.fileBase64,
      contentType: doc.contentType,
    })
    if (!obj) return errorResponse('File is unavailable', 404, 'FILE_MISSING')

    return new NextResponse(new Uint8Array(obj.data), {
      headers: {
        'Content-Type': obj.contentType,
        'Content-Disposition': `inline; filename="${(doc.fileName ?? `document-${doc.id}`).replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error('[admin/documents/:docId/file] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load file')
  }
}
