import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { putObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * POST /api/admin/articles/upload
 *
 * Upload an article cover image (multipart/form-data, field "image").
 * Stored via lib/storage (Vercel Blob when configured, base64 data URL
 * fallback locally). Returns the URL to persist on the article. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

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
    const stored = await putObject(`article-covers/${Date.now()}.${ext}`, buffer, image.type)
    // Articles store a URL; without Blob configured (local dev) fall back to a
    // data URL so the feature still works end-to-end.
    const url = stored.url ?? `data:${image.type};base64,${stored.base64}`

    logger.info('Article cover uploaded', { driver: stored.driver, size: image.size, by: userId })
    return successResponse({ url })
  } catch (error) {
    logger.error(
      'Error uploading article cover',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to upload article cover')
  }
}
