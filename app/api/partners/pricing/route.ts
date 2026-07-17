import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { validateSellAboveFloor } from '@/lib/partners/commission'
import { setClientPricing } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/pricing?clientId=… — margin-model orgs: catalog rows with
 * the org's wholesale floor and the clinic's current price for each SKU.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    if (ctx.org.compensationModel !== 'MARGIN') {
      return errorResponse('Pricing controls are for margin-model partners.', 403, 'NOT_MARGIN_MODEL')
    }

    const clientId = new URL(request.url).searchParams.get('clientId')

    const clinics = await prisma.client.findMany({
      where: { partnerOrgId: ctx.org.id },
      select: { id: true, organizationName: true },
      orderBy: { organizationName: 'asc' },
    })

    if (!clientId) return successResponse({ clinics, items: [] })

    if (!clinics.some((c) => c.id === clientId)) {
      return errorResponse('Clinic not found in your book', 404, 'CLIENT_NOT_FOUND')
    }

    // Only SKUs with a configured floor are partner-priceable.
    const floors = await prisma.partnerOrgPricing.findMany({
      where: { orgId: ctx.org.id },
      include: {
        variant: {
          select: { id: true, sku: true, dose: true, srp: true, product: { select: { name: true } } },
        },
      },
      orderBy: { variant: { product: { name: 'asc' } } },
    })
    const pricing = await prisma.clientPricing.findMany({
      where: { clientId, isActive: true, variantId: { in: floors.map((f) => f.variantId) } },
      select: { variantId: true, customPrice: true },
    })
    const priceByVariant = new Map(
      pricing.map((p) => [p.variantId, Math.round(Number(p.customPrice) * 100)])
    )

    return successResponse({
      clinics,
      items: floors.map((f) => ({
        variantId: f.variantId,
        sku: f.variant.sku,
        name: f.variant.product.name,
        dose: f.variant.dose,
        srpCents: Math.round(Number(f.variant.srp) * 100),
        floorCents: f.floorCents,
        currentPriceCents: priceByVariant.get(f.variantId) ?? null,
      })),
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error loading partner pricing', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load pricing')
  }
}

const putSchema = z.object({
  clientId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  /** Integer cents the clinic will pay. Must be ≥ the org's floor. */
  priceCents: z.number().int().min(1),
})

/**
 * PUT /api/partners/pricing — set a clinic's price for a SKU (≥ the org's
 * wholesale floor). Writes through to ClientPricing so shop checkout and the
 * clinic catalog pick it up immediately; the org earns the spread.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    if (ctx.org.compensationModel !== 'MARGIN') {
      return errorResponse('Pricing controls are for margin-model partners.', 403, 'NOT_MARGIN_MODEL')
    }

    const parsed = putSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { clientId, variantId, priceCents } = parsed.data

    const clinic = await prisma.client.findFirst({
      where: { id: clientId, partnerOrgId: ctx.org.id },
      select: { id: true },
    })
    if (!clinic) return errorResponse('Clinic not found in your book', 404, 'CLIENT_NOT_FOUND')

    const floor = await prisma.partnerOrgPricing.findUnique({
      where: { orgId_variantId: { orgId: ctx.org.id, variantId } },
      select: { floorCents: true },
    })
    if (!floor) {
      return errorResponse('This product has no wholesale floor set for your org.', 400, 'NO_FLOOR')
    }
    const floorError = validateSellAboveFloor(priceCents, floor.floorCents)
    if (floorError) return errorResponse(floorError, 400, 'BELOW_FLOOR')

    const result = await setClientPricing(clientId, variantId, priceCents / 100, {
      notes: `Partner pricing (${ctx.org.name})`,
      createdBy: ctx.userId,
    })
    if (!result.success) return errorResponse(result.error || 'Failed to set price', 500)

    logger.info('[PARTNER PRICING] Clinic price set', {
      orgId: ctx.org.id,
      clientId,
      variantId,
      priceCents,
    })
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error setting partner price', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to set price')
  }
}
