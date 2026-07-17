import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { generatePartnerApiKey } from '@/lib/partners/api-auth'

export const dynamic = 'force-dynamic'

/** GET /api/partners/api-keys — the org's keys (hashes never leave the DB). */
export async function GET() {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const keys = await prisma.partnerApiKey.findMany({
      where: { orgId: ctx.org.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    })
    return successResponse({ keys })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing API keys', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list API keys')
  }
}

const createSchema = z.object({ name: z.string().trim().min(1).max(120) })

/**
 * POST /api/partners/api-keys — create a key. The plaintext is returned ONCE
 * in this response and never stored.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Name is required', 400, 'VALIDATION_ERROR')

    const generated = generatePartnerApiKey()
    const record = await prisma.partnerApiKey.create({
      data: {
        orgId: ctx.org.id,
        name: parsed.data.name,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        createdBy: ctx.userId,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    })
    logger.info('[PARTNER API] Key created', { orgId: ctx.org.id, keyId: record.id })
    return successResponse({ key: generated.key, record }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error creating API key', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create API key')
  }
}

/** DELETE /api/partners/api-keys?id=… — revoke (soft) a key. */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return errorResponse('id is required', 400, 'MISSING_ID')

    const result = await prisma.partnerApiKey.updateMany({
      where: { id, orgId: ctx.org.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (result.count === 0) return errorResponse('Key not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error revoking API key', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to revoke API key')
  }
}
