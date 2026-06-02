import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { resolveShopClientId } from '@/lib/shop-actor'
import { prisma } from '@/lib/prisma'
import { getObject } from '@/lib/storage'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Auth-gated image proxy for a package photo. Streams bytes from the blob
 * backend or the inline base64 fallback. Accessible to any admin, or to the
 * client that owns the linked order (so they can see proof-of-shipment on
 * their order detail page).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const photo = await prisma.packagePhoto.findUnique({
      where: { id },
      select: { blobUrl: true, imageBase64: true, contentType: true, clientId: true },
    })
    if (!photo) return errorResponse('Package photo not found', 404, 'NOT_FOUND')

    if (!isAdmin) {
      const clientId = userId ? await resolveShopClientId(userId) : null
      if (!clientId || clientId !== photo.clientId) {
        return forbiddenResponse('You do not have access to this photo')
      }
    }

    const obj = await getObject({
      url: photo.blobUrl,
      base64: photo.imageBase64,
      contentType: photo.contentType,
    })
    if (!obj) return errorResponse('Image data unavailable', 404, 'NOT_FOUND')

    return new NextResponse(new Uint8Array(obj.data), {
      status: 200,
      headers: {
        'Content-Type': obj.contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(obj.data.length),
      },
    })
  } catch (error) {
    logger.error('[PackagePhoto image] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load image')
  }
}
