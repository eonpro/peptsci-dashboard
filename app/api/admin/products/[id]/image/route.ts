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
import { putObject, deleteObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * POST /api/admin/products/[id]/image
 *
 * Upload a product photo (multipart/form-data, field "image") for the parent
 * Product of the given variant. Stored via lib/storage (Vercel Blob when
 * configured, base64 data URL fallback locally) and saved as the product's
 * primary ProductMedia, replacing any previous primary image. Admin only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const variant = await prisma.productVariant.findUnique({
      where: { id },
      select: { productId: true, product: { select: { name: true } } },
    })
    if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')

    const formData = await request.formData()
    const image = formData.get('image') as File | null
    if (!image) return errorResponse('Image file is required', 400, 'VALIDATION_ERROR')
    if (!ALLOWED_MIME.includes(image.type)) {
      return errorResponse('Invalid file type. Upload JPEG, PNG, or WebP.', 400, 'VALIDATION_ERROR')
    }
    if (image.size > MAX_FILE_SIZE) {
      return errorResponse('File too large. Maximum size is 5MB.', 400, 'VALIDATION_ERROR')
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    const ext = image.type.split('/')[1] || 'jpg'
    const stored = await putObject(
      `product-images/${variant.productId}-${Date.now()}.${ext}`,
      buffer,
      image.type
    )
    // ProductMedia stores a URL; without Blob configured (local dev) fall back
    // to a data URL so the feature still works end-to-end.
    const url = stored.url ?? `data:${image.type};base64,${stored.base64}`

    const previous = await prisma.productMedia.findFirst({
      where: { productId: variant.productId, isPrimary: true },
      select: { id: true, url: true },
    })

    if (previous) {
      await prisma.productMedia.update({
        where: { id: previous.id },
        data: { url, altText: variant.product.name },
      })
      // Best-effort cleanup of the replaced blob object.
      if (previous.url.startsWith('http')) await deleteObject({ url: previous.url })
    } else {
      await prisma.productMedia.create({
        data: { productId: variant.productId, url, altText: variant.product.name, isPrimary: true },
      })
    }

    logger.info('Product image uploaded', {
      productId: variant.productId,
      driver: stored.driver,
      size: image.size,
      by: userId,
    })

    return successResponse({ url })
  } catch (error) {
    logger.error(
      'Error uploading product image',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to upload product image')
  }
}

/**
 * DELETE /api/admin/products/[id]/image
 *
 * Remove the primary photo of the variant's parent Product. Admin only.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const variant = await prisma.productVariant.findUnique({
      where: { id },
      select: { productId: true },
    })
    if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')

    const media = await prisma.productMedia.findFirst({
      where: { productId: variant.productId, isPrimary: true },
      select: { id: true, url: true },
    })
    if (media) {
      await prisma.productMedia.delete({ where: { id: media.id } })
      if (media.url.startsWith('http')) await deleteObject({ url: media.url })
    }

    return successResponse({ deleted: !!media })
  } catch (error) {
    logger.error(
      'Error deleting product image',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete product image')
  }
}
