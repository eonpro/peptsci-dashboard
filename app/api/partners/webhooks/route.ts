import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { generateWebhookSecret, PARTNER_WEBHOOK_EVENTS } from '@/lib/partners/webhooks'

export const dynamic = 'force-dynamic'

/** GET /api/partners/webhooks — the org's webhook subscriptions. */
export async function GET() {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const webhooks = await prisma.partnerWebhook.findMany({
      where: { orgId: ctx.org.id },
      orderBy: { createdAt: 'desc' },
    })
    return successResponse({ webhooks, events: PARTNER_WEBHOOK_EVENTS })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing webhooks', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list webhooks')
  }
}

const createSchema = z.object({
  url: z.string().trim().url().max(500).startsWith('https://', 'Webhook URLs must be https'),
  events: z.array(z.enum(['commission.accrued', 'commission.reversed', 'payout.recorded'])).max(10).default([]),
})

/**
 * POST /api/partners/webhooks — subscribe a URL. The signing secret is
 * returned once; deliveries carry an `X-PeptSci-Signature: t=…,v1=…` header
 * (HMAC-SHA256 of `<t>.<body>`).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const secret = generateWebhookSecret()
    const webhook = await prisma.partnerWebhook.create({
      data: {
        orgId: ctx.org.id,
        url: parsed.data.url,
        secret,
        events: parsed.data.events,
        createdBy: ctx.userId,
      },
    })
    logger.info('[PARTNER API] Webhook created', { orgId: ctx.org.id, webhookId: webhook.id })
    return successResponse({ webhook: { ...webhook, secret } }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error creating webhook', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create webhook')
  }
}

const patchSchema = z.object({
  webhookId: z.string().trim().min(1),
  active: z.boolean(),
})

/** PATCH /api/partners/webhooks — pause/resume a subscription. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    const result = await prisma.partnerWebhook.updateMany({
      where: { id: parsed.data.webhookId, orgId: ctx.org.id },
      data: { active: parsed.data.active },
    })
    if (result.count === 0) return errorResponse('Webhook not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating webhook', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update webhook')
  }
}

/** DELETE /api/partners/webhooks?id=… — remove a subscription. */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return errorResponse('id is required', 400, 'MISSING_ID')

    const result = await prisma.partnerWebhook.deleteMany({ where: { id, orgId: ctx.org.id } })
    if (result.count === 0) return errorResponse('Webhook not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error deleting webhook', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to delete webhook')
  }
}
