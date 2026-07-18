import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/products/[id]/coa/[coaId]/file
 * Stream the source COA document (JPG/PDF) for admin review. Admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; coaId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id, coaId } = await params
    const coa = await prisma.productCoa.findFirst({
      where: { id: coaId, variantId: id },
      select: { fileUrl: true, fileBase64: true, contentType: true, fileName: true, id: true },
    })
    if (!coa) return errorResponse('COA not found', 404, 'NOT_FOUND')

    const obj = await getObject({
      url: coa.fileUrl,
      base64: coa.fileBase64,
      contentType: coa.contentType,
    })
    if (!obj) return errorResponse('Source document unavailable', 404, 'FILE_MISSING')

    return new NextResponse(new Uint8Array(obj.data), {
      headers: {
        'Content-Type': obj.contentType,
        'Content-Disposition': `inline; filename="${(coa.fileName ?? `coa-${coa.id}`).replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    logger.error(
      '[admin coa file] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load COA file')
  }
}
