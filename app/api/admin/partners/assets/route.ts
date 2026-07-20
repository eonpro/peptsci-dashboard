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
import { putObject } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/** GET /api/admin/partners/assets — all assets (incl. inactive) for management. */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const assets = await prisma.partnerAsset.findMany({ orderBy: { createdAt: 'desc' } })
    return successResponse({ assets })
  } catch (error) {
    logger.error('Error listing assets', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list assets')
  }
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  kind: z.enum(['IMAGE', 'DOCUMENT', 'COPY']),
  copyText: z.string().trim().max(5000).optional().or(z.literal('')),
  fileName: z.string().trim().max(200).optional().or(z.literal('')),
  contentType: z.string().trim().max(100).optional().or(z.literal('')),
  base64: z.string().max(8_000_000).optional().or(z.literal('')),
})

/** POST /api/admin/partners/assets — publish a marketing asset. */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data

    if (data.kind === 'COPY') {
      if (!data.copyText) return errorResponse('Copy assets need the text body', 400, 'COPY_REQUIRED')
      const asset = await prisma.partnerAsset.create({
        data: {
          title: data.title,
          description: data.description || null,
          kind: 'COPY',
          copyText: data.copyText,
          createdBy: userId,
        },
      })
      return successResponse({ asset }, 201)
    }

    if (!data.base64 || !data.fileName || !data.contentType) {
      return errorResponse('File assets need fileName, contentType, and base64', 400, 'FILE_REQUIRED')
    }
    const buffer = Buffer.from(data.base64, 'base64')
    if (buffer.length > 6 * 1024 * 1024) {
      return errorResponse('File too large (6MB max)', 400, 'FILE_TOO_LARGE')
    }
    const stored = await putObject(
      `partner-assets/${Date.now()}-${data.fileName}`,
      buffer,
      data.contentType
    )
    if (stored.driver !== 'blob' || !stored.url) {
      return errorResponse('Asset storage is unavailable — try again shortly.', 503, 'STORAGE_UNAVAILABLE')
    }

    const asset = await prisma.partnerAsset.create({
      data: {
        title: data.title,
        description: data.description || null,
        kind: data.kind,
        blobUrl: stored.url,
        fileName: data.fileName,
        contentType: data.contentType,
        createdBy: userId,
      },
    })
    logger.info('[ADMIN PARTNERS] Asset published', { assetId: asset.id })
    return successResponse({ asset }, 201)
  } catch (error) {
    logger.error('Error creating asset', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create asset')
  }
}

const patchSchema = z.object({
  assetId: z.string().trim().min(1),
  isActive: z.boolean(),
})

/** PATCH /api/admin/partners/assets — publish/unpublish an asset. */
export async function PATCH(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    await prisma.partnerAsset.update({
      where: { id: parsed.data.assetId },
      data: { isActive: parsed.data.isActive },
    })
    return successResponse({ success: true })
  } catch (error) {
    logger.error('Error updating asset', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update asset')
  }
}
