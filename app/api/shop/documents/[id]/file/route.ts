import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { getObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/shop/documents/[id]/file — auth-gated proxy for the client's own file. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const doc = await prisma.clientDocument.findFirst({ where: { id, clientId } })
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
    logger.error('[shop/documents/:id/file] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load file')
  }
}
