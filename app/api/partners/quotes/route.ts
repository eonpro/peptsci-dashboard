import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'

export const dynamic = 'force-dynamic'

export interface QuoteItemSnapshot {
  variantId: string
  name: string
  dose: string | null
  sku: string | null
  quantity: number
  unitPriceCents: number
  totalCents: number
}

/**
 * GET /api/partners/quotes — the caller's quotes plus the active catalog for
 * the builder (with the org's floors when margin-model, so quotes can't be
 * built below floor).
 */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const [quotes, variants, floors] = await Promise.all([
      prisma.partnerQuote.findMany({
        where: {
          orgId: ctx.org.id,
          ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
        },
        include: { rep: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.productVariant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          sku: true,
          dose: true,
          srp: true,
          product: { select: { name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
      }),
      ctx.org.compensationModel === 'MARGIN'
        ? prisma.partnerOrgPricing.findMany({
            where: { orgId: ctx.org.id },
            select: { variantId: true, floorCents: true },
          })
        : Promise.resolve([]),
    ])
    const floorByVariant = new Map(floors.map((f) => [f.variantId, f.floorCents]))

    return successResponse({
      quotes,
      catalog: variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        name: v.product.name,
        dose: v.dose,
        srpCents: Math.round(Number(v.srp) * 100),
        floorCents: floorByVariant.get(v.id) ?? null,
      })),
      marginModel: ctx.org.compensationModel === 'MARGIN',
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing quotes', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list quotes')
  }
}

const createSchema = z.object({
  clinicName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        variantId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(10_000),
        /** Integer cents; defaults to SRP when omitted. */
        unitPriceCents: z.number().int().min(1).optional(),
      })
    )
    .min(1)
    .max(100),
})

/** POST /api/partners/quotes — build a quote (prices snapshot server-side). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: input.items.map((i) => i.variantId) } },
      select: { id: true, sku: true, dose: true, srp: true, product: { select: { name: true } } },
    })
    const byId = new Map(variants.map((v) => [v.id, v]))

    const floors =
      ctx.org.compensationModel === 'MARGIN'
        ? new Map(
            (
              await prisma.partnerOrgPricing.findMany({
                where: { orgId: ctx.org.id },
                select: { variantId: true, floorCents: true },
              })
            ).map((f) => [f.variantId, f.floorCents])
          )
        : new Map<string, number>()

    const items: QuoteItemSnapshot[] = []
    for (const item of input.items) {
      const variant = byId.get(item.variantId)
      if (!variant) return errorResponse('Unknown product in quote', 400, 'VARIANT_NOT_FOUND')
      const srpCents = Math.round(Number(variant.srp) * 100)
      const unitPriceCents = item.unitPriceCents ?? srpCents
      const floor = floors.get(item.variantId)
      if (floor != null && unitPriceCents < floor) {
        return errorResponse(
          `${variant.product.name} can't be quoted below your floor.`,
          400,
          'BELOW_FLOOR'
        )
      }
      items.push({
        variantId: variant.id,
        name: variant.product.name,
        dose: variant.dose,
        sku: variant.sku,
        quantity: item.quantity,
        unitPriceCents,
        totalCents: unitPriceCents * item.quantity,
      })
    }
    const totalCents = items.reduce((sum, i) => sum + i.totalCents, 0)

    const quote = await prisma.partnerQuote.create({
      data: {
        orgId: ctx.org.id,
        repId: ctx.kind === 'REP' ? ctx.rep!.id : null,
        clinicName: input.clinicName,
        contactName: input.contactName || null,
        email: input.email || null,
        notes: input.notes || null,
        items: items as unknown as object[],
        totalCents,
        status: 'DRAFT',
      },
    })
    return successResponse({ quote }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error creating quote', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create quote')
  }
}

const patchSchema = z.object({
  quoteId: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED']),
})

/** PATCH /api/partners/quotes — advance a quote's status. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    const result = await prisma.partnerQuote.updateMany({
      where: {
        id: parsed.data.quoteId,
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
      },
      data: { status: parsed.data.status },
    })
    if (result.count === 0) return errorResponse('Quote not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating quote', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update quote')
  }
}
