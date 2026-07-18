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
import { putObject } from '@/lib/storage'
import { coaInputSchema, coaScalarSelect, toCoaData, type CoaRow } from '@/lib/coa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

/** Build the admin proxy URL for a COA's source document. */
function adminFileUrl(variantId: string, coaId: string): string {
  return `/api/admin/products/${variantId}/coa/${coaId}/file`
}

/**
 * GET /api/admin/products/[id]/coa
 * List all COAs (published or not) for the given variant. Admin only.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const rows = await prisma.productCoa.findMany({
      where: { variantId: id },
      select: coaScalarSelect,
      orderBy: [{ analyzedOn: 'desc' }, { createdAt: 'desc' }],
    })
    const coas = (rows as unknown as CoaRow[]).map((r) =>
      toCoaData(r, r.fileName || r.fileUrl ? adminFileUrl(id, r.id) : null)
    )
    return successResponse({ coas })
  } catch (error) {
    logger.error(
      'Error listing product COAs',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list COAs')
  }
}

/**
 * POST /api/admin/products/[id]/coa
 * Create a COA for the variant. multipart/form-data:
 *  - `file` (optional): the supplier certificate JPG/PNG/PDF
 *  - `data`: JSON string of the structured COA fields (see coaInputSchema)
 * Admin only.
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
      select: { id: true },
    })
    if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')

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

    let fileUrl: string | null = null
    let fileBase64: string | null = null
    let contentType: string | null = null
    let fileName: string | null = null

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
      fileUrl = stored.url ?? null
      fileBase64 = stored.base64 ?? null
      contentType = file.type
      fileName = file.name
    }

    const created = await prisma.productCoa.create({
      data: {
        variantId: id,
        ...parsed.data,
        fileUrl,
        fileBase64,
        contentType,
        fileName,
      },
      select: coaScalarSelect,
    })

    logger.info('Product COA created', { variantId: id, coaId: created.id, by: userId })
    return successResponse(
      { coa: toCoaData(created as unknown as CoaRow, fileName ? adminFileUrl(id, created.id) : null) },
      201
    )
  } catch (error) {
    logger.error(
      'Error creating product COA',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create COA')
  }
}
