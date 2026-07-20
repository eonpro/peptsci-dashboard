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
import { dollarsToCents, formatCents } from '@/lib/partners/commission'

export const dynamic = 'force-dynamic'

const bonusSchema = z.object({
  /** Bonus dollars granted to the org THAT REFERRED this one. */
  amount: z.number().min(1).max(100_000),
  note: z.string().trim().max(300).optional().or(z.literal('')),
})

/**
 * POST /api/admin/partners/[id]/referral-bonus — grant a partner-referral
 * bonus to the org that referred THIS org. Recorded as a clinic-less MANUAL
 * transaction with a single ORG earning entry (idempotent: one bonus per
 * referred org via the unique reference).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !userId) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = bonusSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    const org = await prisma.partnerOrg.findUnique({
      where: { id },
      select: { name: true, referredByOrgId: true, referredByOrg: { select: { name: true, status: true } } },
    })
    if (!org) return errorResponse('Partner org not found', 404, 'NOT_FOUND')
    if (!org.referredByOrgId || !org.referredByOrg) {
      return errorResponse('This org was not referred by another partner.', 400, 'NOT_REFERRED')
    }
    if (org.referredByOrg.status !== 'ACTIVE') {
      return errorResponse('The referring org is not active.', 409, 'REFERRER_INACTIVE')
    }

    const amountCents = dollarsToCents(parsed.data.amount)
    const reference = `partner-referral:${id}`
    const existing = await prisma.partnerTransaction.findUnique({
      where: { reference },
      select: { id: true },
    })
    if (existing) {
      return errorResponse('A referral bonus for this org was already granted.', 409, 'ALREADY_GRANTED')
    }

    await prisma.partnerTransaction.create({
      data: {
        orgId: org.referredByOrgId,
        clientId: null,
        transactionDate: new Date(),
        description:
          parsed.data.note || `Partner referral bonus — referred ${org.name} to the program`,
        reference,
        revenueCents: 0,
        source: 'MANUAL',
        createdBy: userId,
        entries: {
          create: [
            {
              orgId: org.referredByOrgId,
              payee: 'ORG',
              kind: 'EARNING',
              rateBps: 0,
              amountCents,
              status: 'PENDING',
            },
          ],
        },
      },
    })

    logger.info('[ADMIN PARTNERS] Referral bonus granted', {
      referredOrgId: id,
      referrerOrgId: org.referredByOrgId,
      amountCents,
    })
    return successResponse(
      { success: true, message: `${formatCents(amountCents)} bonus granted to ${org.referredByOrg.name}` },
      201
    )
  } catch (error) {
    logger.error('Error granting referral bonus', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to grant referral bonus')
  }
}
