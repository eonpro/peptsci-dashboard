import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { putObject } from '@/lib/storage'
import { validateDocumentUpload, documentExpiryState } from '@/lib/documents'
import { notifyAdmins } from '@/lib/notifications/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serialize(doc: {
  id: string
  type: string
  label: string | null
  fileName: string | null
  fileSize: number | null
  contentType: string | null
  status: string
  reviewNotes: string | null
  expiresAt: Date | null
  createdAt: Date
}) {
  return {
    id: doc.id,
    type: doc.type,
    label: doc.label,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    contentType: doc.contentType,
    status: doc.status,
    reviewNotes: doc.reviewNotes,
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    expiryState: documentExpiryState(doc.expiresAt),
    createdAt: doc.createdAt.toISOString(),
  }
}

/** GET /api/shop/documents — the caller's practice documents. */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const docs = await prisma.clientDocument.findMany({
      where: { clientId: actor.clientId },
      orderBy: { createdAt: 'desc' },
    })
    return successResponse({ documents: docs.map(serialize) })
  } catch (error) {
    logger.error('[shop/documents] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load documents')
  }
}

/**
 * POST /api/shop/documents — upload a compliance document (multipart form:
 * file, type, expiresAt?, label?). Stored via lib/storage.ts (blob or inline
 * base64) and queued for admin review (PENDING_REVIEW).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = ((formData.get('type') as string | null) ?? '').trim()
    const label = ((formData.get('label') as string | null) ?? '').trim().slice(0, 120) || null
    const expiresAtRaw = ((formData.get('expiresAt') as string | null) ?? '').trim()

    if (!file) return errorResponse('A file is required', 400, 'VALIDATION_ERROR')

    const validation = validateDocumentUpload({ type, mime: file.type, size: file.size })
    if (!validation.ok) return errorResponse(validation.message, 400, validation.code)

    let expiresAt: Date | null = null
    if (expiresAtRaw) {
      const parsed = new Date(expiresAtRaw)
      if (Number.isNaN(parsed.getTime())) {
        return errorResponse('Invalid expiration date', 400, 'VALIDATION_ERROR')
      }
      expiresAt = parsed
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] || 'bin'
    const stored = await putObject(
      `client-docs/${actor.clientId}/${validation.type.toLowerCase()}-${Date.now()}.${ext}`,
      buffer,
      file.type
    )

    const doc = await prisma.clientDocument.create({
      data: {
        clientId: actor.clientId,
        type: validation.type,
        label,
        fileUrl: stored.url ?? null,
        fileBase64: stored.base64 ?? null,
        contentType: file.type,
        fileName: file.name?.slice(0, 200) || null,
        fileSize: file.size,
        expiresAt,
        uploadedBy: actor.userId,
      },
    })

    // Alert ops that a document needs review. Fire-and-forget.
    const client = await prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { organizationName: true },
    })
    notifyAdmins({
      category: 'CLIENT',
      priority: 'NORMAL',
      title: `Document uploaded: ${validation.type}`,
      message: `${client?.organizationName ?? 'A client'} uploaded a ${validation.type} document for review.`,
      actionUrl: `/clients/${actor.clientId}`,
      sourceType: 'client-document:uploaded',
      sourceId: doc.id,
      clientId: actor.clientId,
    }).catch((e) =>
      logger.warn('[shop/documents] admin notify failed (non-blocking)', {
        documentId: doc.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    logger.info('[shop/documents] uploaded', {
      documentId: doc.id,
      clientId: actor.clientId,
      type: validation.type,
      size: file.size,
    })

    return successResponse({ document: serialize(doc) }, 201)
  } catch (error) {
    logger.error('[shop/documents] upload error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to upload document')
  }
}
