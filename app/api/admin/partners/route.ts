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

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/partners — all partner orgs with headline rollups.
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const orgs = await prisma.partnerOrg.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { reps: true, clients: true, referralLinks: true } },
      },
    })

    // Ledger rollups per org (net EARNING − REVERSAL, split unpaid/paid).
    const grouped = await prisma.commissionEntry.groupBy({
      by: ['orgId', 'status', 'kind'],
      _sum: { amountCents: true },
    })
    const revenue = await prisma.partnerTransaction.groupBy({
      by: ['orgId'],
      _sum: { revenueCents: true },
    })
    const revenueByOrg = new Map(revenue.map((r) => [r.orgId, r._sum.revenueCents ?? 0]))
    const totals = new Map<string, { unpaidCents: number; paidCents: number }>()
    for (const g of grouped) {
      const t = totals.get(g.orgId) ?? { unpaidCents: 0, paidCents: 0 }
      const amount = (g._sum.amountCents ?? 0) * (g.kind === 'REVERSAL' ? -1 : 1)
      if (g.status === 'PAID') t.paidCents += amount
      else t.unpaidCents += amount
      totals.set(g.orgId, t)
    }

    return successResponse({
      orgs: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        contactName: org.contactName,
        contactEmail: org.contactEmail,
        contactPhone: org.contactPhone,
        website: org.website,
        status: org.status,
        compensationModel: org.compensationModel,
        commissionRateBps: org.commissionRateBps,
        msaSignedAt: org.msaSignedAt,
        hasLogin: Boolean(org.clerkUserId),
        createdAt: org.createdAt,
        repCount: org._count.reps,
        clientCount: org._count.clients,
        linkCount: org._count.referralLinks,
        revenueCents: revenueByOrg.get(org.id) ?? 0,
        unpaidCents: totals.get(org.id)?.unpaidCents ?? 0,
        paidCents: totals.get(org.id)?.paidCents ?? 0,
      })),
    })
  } catch (error) {
    logger.error(
      'Error listing partner orgs',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list partner orgs')
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contactName: z.string().trim().max(200).optional().or(z.literal('')),
  contactEmail: z.string().trim().email().max(255).toLowerCase(),
  contactPhone: z.string().trim().max(30).optional().or(z.literal('')),
  website: z.string().trim().max(255).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  compensationModel: z.enum(['COMMISSION', 'MARGIN']).default('COMMISSION'),
  commissionRateBps: z.number().int().min(0).max(10_000).default(0),
})

/**
 * POST /api/admin/partners — create a partner org directly (admin-sourced,
 * skips the public application). Created PENDING; approve to provision login.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
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

    const existing = await prisma.partnerOrg.findUnique({
      where: { contactEmail: data.contactEmail },
      select: { id: true },
    })
    if (existing) {
      return errorResponse('A partner org with this email already exists.', 409, 'DUPLICATE')
    }

    const org = await prisma.partnerOrg.create({
      data: {
        name: data.name,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone || null,
        website: data.website || null,
        notes: data.notes || null,
        compensationModel: data.compensationModel,
        commissionRateBps: data.commissionRateBps,
        status: 'PENDING',
      },
    })
    logger.info('[ADMIN PARTNERS] Org created', { orgId: org.id })
    return successResponse({ org }, 201)
  } catch (error) {
    logger.error(
      'Error creating partner org',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create partner org')
  }
}
