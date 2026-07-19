import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/storefront/coa/[coaId]/file
 *
 * Public (white-label storefronts are unauthenticated — see middleware, which
 * lets `/api/storefront(.*)` through). Streams the source document of a
 * *published* COA. Unpublished COAs are treated as not found so drafts never
 * leak to retail shoppers.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ coaId: string }> }) {
  try {
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { coaId } = await params
    const coa = await prisma.productCoa.findFirst({
      where: { id: coaId, published: true },
      select: { id: true, fileUrl: true, fileBase64: true, contentType: true, fileName: true },
    })
    if (!coa) return errorResponse('Certificate not found', 404, 'NOT_FOUND')

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
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    logger.error('[storefront coa file] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load certificate file')
  }
}
