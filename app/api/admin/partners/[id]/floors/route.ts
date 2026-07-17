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

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/admin/partners/[id]/floors — the full active catalog with this
 * org's wholesale floors (margin-model orgs price their clinics above these).
 */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const [variants, floors] = await Promise.all([
      prisma.productVariant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          sku: true,
          dose: true,
          unitCost: true,
          srp: true,
          product: { select: { name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
      }),
      prisma.partnerOrgPricing.findMany({ where: { orgId: id } }),
    ])
    const floorByVariant = new Map(floors.map((f) => [f.variantId, f.floorCents]))

    return successResponse({
      items: variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        name: v.product.name,
        dose: v.dose,
        unitCostCents: Math.round(Number(v.unitCost) * 100),
        srpCents: Math.round(Number(v.srp) * 100),
        floorCents: floorByVariant.get(v.id) ?? null,
      })),
    })
  } catch (error) {
    logger.error('Error loading floors', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load floors')
  }
}

const putSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().trim().min(1),
        /** Integer cents; null clears the floor (SKU stops earning margin). */
        floorCents: z.number().int().min(0).nullable(),
      })
    )
    .min(1)
    .max(1000),
})

/** PUT /api/admin/partners/[id]/floors — upsert/clear wholesale floors. */
export async function PUT(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = putSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    const org = await prisma.partnerOrg.findUnique({ where: { id }, select: { id: true } })
    if (!org) return errorResponse('Partner org not found', 404, 'NOT_FOUND')

    let updated = 0
    let cleared = 0
    for (const item of parsed.data.items) {
      if (item.floorCents == null || item.floorCents <= 0) {
        const res = await prisma.partnerOrgPricing.deleteMany({
          where: { orgId: id, variantId: item.variantId },
        })
        cleared += res.count
      } else {
        await prisma.partnerOrgPricing.upsert({
          where: { orgId_variantId: { orgId: id, variantId: item.variantId } },
          update: { floorCents: item.floorCents },
          create: { orgId: id, variantId: item.variantId, floorCents: item.floorCents },
        })
        updated += 1
      }
    }

    logger.info('[ADMIN PARTNERS] Floors updated', { orgId: id, updated, cleared })
    return successResponse({ updated, cleared })
  } catch (error) {
    logger.error('Error saving floors', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to save floors')
  }
}
