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
import { coaInputSchema, coaScalarSelect, toCoaData, type CoaRow } from '@/lib/coa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

function adminFileUrl(variantId: string, coaId: string): string {
  return `/api/admin/products/${variantId}/coa/${coaId}/file`
}

/**
 * PATCH /api/admin/products/[id]/coa/[coaId]
 * Update a COA's structured fields, publish flag, and optionally replace the
 * source document. multipart/form-data with `data` (JSON) + optional `file`.
 * Admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; coaId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id, coaId } = await params
    const existing = await prisma.productCoa.findFirst({
      where: { id: coaId, variantId: id },
      select: { id: true, fileUrl: true },
    })
    if (!existing) return errorResponse('COA not found', 404, 'NOT_FOUND')

    const formData = await request.formData()
    const rawData = formData.get('data')
    let payload: unknown
    try {
      payload = JSON.parse(typeof rawData === 'string' ? rawData : '{}')
    } catch {
      return errorResponse('Malformed COA data payload', 400, 'VALIDATION_ERROR')
    }
    const parsed = coaInputSchema.safeParse(payload)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const fileFields: {
      fileUrl?: string | null
      fileBase64?: string | null
      contentType?: string | null
      fileName?: string | null
    } = {}

    const file = formData.get('file') as File | null
    if (file && file.size > 0) {
      if (!ALLOWED_MIME.includes(file.type)) {
        return errorResponse('Invalid file type. Upload JPEG, PNG, WebP, or PDF.', 400, 'VALIDATION_ERROR')
      }
      if (file.size > MAX_FILE_SIZE) {
        return errorResponse('File too large. Maximum size is 10MB.', 400, 'VALIDATION_ERROR')
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')
      const stored = await putObject(`product-coas/${id}-${Date.now()}.${ext}`, buffer, file.type)
      fileFields.fileUrl = stored.url ?? null
      fileFields.fileBase64 = stored.base64 ?? null
      fileFields.contentType = file.type
      fileFields.fileName = file.name
      // Clean up the replaced blob (best-effort).
      if (existing.fileUrl && existing.fileUrl.startsWith('http')) {
        await deleteObject({ url: existing.fileUrl })
      }
    }

    const updated = await prisma.productCoa.update({
      where: { id: coaId },
      data: { ...parsed.data, ...fileFields },
      select: coaScalarSelect,
    })

    logger.info('Product COA updated', { variantId: id, coaId, by: userId })
    return successResponse({
      coa: toCoaData(
        updated as unknown as CoaRow,
        (updated as unknown as CoaRow).fileName || (updated as unknown as CoaRow).fileUrl
          ? adminFileUrl(id, coaId)
          : null
      ),
    })
  } catch (error) {
    logger.error(
      'Error updating product COA',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update COA')
  }
}

/**
 * DELETE /api/admin/products/[id]/coa/[coaId]
 * Remove a COA and its stored source document. Admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; coaId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id, coaId } = await params
    const existing = await prisma.productCoa.findFirst({
      where: { id: coaId, variantId: id },
      select: { id: true, fileUrl: true },
    })
    if (!existing) return errorResponse('COA not found', 404, 'NOT_FOUND')

    await prisma.productCoa.delete({ where: { id: coaId } })
    if (existing.fileUrl && existing.fileUrl.startsWith('http')) {
      await deleteObject({ url: existing.fileUrl })
    }

    return successResponse({ deleted: true })
  } catch (error) {
    logger.error(
      'Error deleting product COA',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete COA')
  }
}
