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
import { approvedBalance } from '@/lib/partners/queries'
import { dispatchPartnerEvent } from '@/lib/partners/webhooks'
import { sendPartnerPayoutRecordedEmail } from '@/lib/email'
import { formatCents } from '@/lib/partners/commission'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const payoutSchema = z.object({
  payee: z.enum(['ORG', 'REP']),
  repId: z.string().trim().min(1).optional(),
  method: z.string().trim().max(40).optional().or(z.literal('')),
  reference: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
})

/**
 * POST /api/admin/partners/[id]/payouts — record a payout of the payee's full
 * APPROVED balance. Atomic: the payout row and the entries' PAID flip commit
 * together, so a re-click can never double-pay (the second run sees no
 * APPROVED entries).
 */
export async function POST(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !userId) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = payoutSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { payee, repId } = parsed.data
    if (payee === 'REP' && !repId) {
      return errorResponse('repId is required for rep payouts', 400, 'REP_REQUIRED')
    }

    const balance = await approvedBalance(id, payee, repId ?? null)
    if (balance.amountCents <= 0 || balance.entryIds.length === 0) {
      return errorResponse(
        'No approved balance to pay out. Approve pending entries first.',
        409,
        'NO_APPROVED_BALANCE'
      )
    }

    const admin = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      select: { email: true },
    })

    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.partnerPayout.create({
        data: {
          orgId: id,
          repId: payee === 'REP' ? repId : null,
          payee,
          amountCents: balance.amountCents,
          method: parsed.data.method || null,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          recordedBy: userId,
          recordedByEmail: admin?.email ?? null,
        },
      })
      // Guard on status APPROVED again inside the transaction so a concurrent
      // payout can't pay the same entries twice.
      const flipped = await tx.commissionEntry.updateMany({
        where: { id: { in: balance.entryIds }, status: 'APPROVED' },
        data: { status: 'PAID', payoutId: created.id },
      })
      if (flipped.count !== balance.entryIds.length) {
        throw new Error('CONCURRENT_PAYOUT')
      }
      return created
    })

    logger.info('[ADMIN PARTNERS] Payout recorded', {
      orgId: id,
      payoutId: payout.id,
      payee,
      amountCents: payout.amountCents,
    })
    void dispatchPartnerEvent(id, 'payout.recorded', {
      payoutId: payout.id,
      payee,
      repId: payout.repId,
      amountCents: payout.amountCents,
      method: payout.method,
      reference: payout.reference,
    })

    // Resolve any open payout request for this payee + email the recipient.
    await prisma.partnerPayoutRequest
      .updateMany({
        where: {
          orgId: id,
          payee,
          ...(payee === 'REP' ? { repId } : {}),
          status: 'PENDING',
        },
        data: { status: 'COMPLETED', resolvedBy: userId, resolvedAt: new Date() },
      })
      .catch(() => {})
    const recipient =
      payee === 'REP' && repId
        ? await prisma.partnerRep.findUnique({
            where: { id: repId },
            select: { email: true, name: true },
          })
        : await prisma.partnerOrg.findUnique({
            where: { id },
            select: { contactEmail: true, contactName: true, notifyByEmail: true },
          })
    if (recipient) {
      const to = 'email' in recipient ? recipient.email : recipient.contactEmail
      const name = 'name' in recipient ? recipient.name : recipient.contactName
      const wants = 'notifyByEmail' in recipient ? recipient.notifyByEmail : true
      if (to && wants) {
        sendPartnerPayoutRecordedEmail({
          to,
          contactName: name,
          amount: formatCents(payout.amountCents),
          method: payout.method,
          reference: payout.reference,
        }).catch(() => {})
      }
    }
    return successResponse({ payout }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'CONCURRENT_PAYOUT') {
      return errorResponse('Entries changed while recording — try again.', 409, 'CONCURRENT_PAYOUT')
    }
    logger.error(
      'Error recording payout',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to record payout')
  }
}
