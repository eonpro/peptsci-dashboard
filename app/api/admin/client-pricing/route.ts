import { NextRequest, NextResponse } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { setClientPricing, removeClientPricing, getClientPricing } from '@/lib/pricing'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Schema for creating/updating client pricing
const clientPricingSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  variantId: z.string().min(1, 'Variant ID is required'),
  customPrice: z.number().positive('Price must be positive'),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().optional().default(true),
})

// GET - List all custom pricing (optionally filtered by client)
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }
    if (!isAdmin) {
      return forbiddenResponse('Admin access required')
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    // If database is connected, use Prisma
    if (prisma) {
      const pricing = await prisma.clientPricing.findMany({
        where: clientId ? { clientId, isActive: true } : { isActive: true },
        include: {
          client: {
            select: {
              organizationName: true,
            },
          },
          variant: {
            select: {
              sku: true,
              dose: true,
              srp: true,
              product: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Transform to include product details
      const enrichedPricing = pricing.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        clientName: p.client.organizationName,
        variantId: p.variantId,
        variantSku: p.variant.sku,
        productName: p.variant.product.name,
        dose: p.variant.dose,
        standardPrice: Number(p.variant.srp),
        customPrice: Number(p.customPrice),
        discountPercent: p.discountPercent ? Number(p.discountPercent) : null,
        notes: p.notes,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        createdBy: p.createdBy,
      }))

      return successResponse(enrichedPricing)
    }

    // Fallback: If we have a clientId, try the pricing module
    if (clientId) {
      const { prices } = await getClientPricing(clientId)
      const customPrices = prices.filter((p) => p.customPrice !== null)
      return successResponse(customPrices)
    }

    // No DB and no client ID - return empty
    return successResponse([])
  } catch (error) {
    logger.error(
      'Error fetching client pricing',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to fetch client pricing')
  }
}

// POST - Create or update custom pricing for a client
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }
    if (!isAdmin) {
      return forbiddenResponse('Admin access required')
    }

    const body = await request.json()
    const parseResult = clientPricingSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: parseResult.error.errors.map((e) => e.message).join(', '),
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const { clientId, variantId, customPrice, discountPercent, notes, validFrom, validUntil } =
      parseResult.data

    // Use the pricing module which handles Postgres
    const result = await setClientPricing(clientId, variantId, customPrice, {
      discountPercent,
      notes,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      createdBy: userId || undefined,
    })

    if (!result.success) {
      return errorResponse(result.error || 'Failed to set pricing')
    }

    logger.info('Client pricing set', {
      clientId,
      variantId,
      customPrice,
      setBy: userId,
    })

    // Return the updated pricing
    if (prisma) {
      const pricing = await prisma.clientPricing.findUnique({
        where: {
          clientId_variantId: { clientId, variantId },
        },
      })
      return successResponse(pricing)
    }

    return successResponse({ clientId, variantId, customPrice })
  } catch (error) {
    logger.error(
      'Error creating client pricing',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create client pricing')
  }
}

// DELETE - Remove custom pricing
export async function DELETE(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }
    if (!isAdmin) {
      return forbiddenResponse('Admin access required')
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const clientId = searchParams.get('clientId')
    const variantId = searchParams.get('variantId')

    // Support deletion by ID or by client+variant combo
    if (id && prisma) {
      // Delete by ID
      const existing = await prisma.clientPricing.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Pricing not found', code: 'NOT_FOUND' },
          { status: 404 }
        )
      }

      await prisma.clientPricing.update({
        where: { id },
        data: { isActive: false },
      })

      logger.info('Client pricing deleted by ID', { pricingId: id, deletedBy: userId })
      return successResponse({ message: 'Pricing deleted successfully' })
    }

    if (clientId && variantId) {
      // Delete by client + variant
      const result = await removeClientPricing(clientId, variantId)
      if (!result.success) {
        return errorResponse(result.error || 'Failed to delete pricing')
      }

      logger.info('Client pricing deleted', {
        clientId,
        variantId,
        deletedBy: userId,
      })
      return successResponse({ message: 'Pricing deleted successfully' })
    }

    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Pricing ID or clientId+variantId is required',
        code: 'MISSING_PARAMS',
      },
      { status: 400 }
    )
  } catch (error) {
    logger.error(
      'Error deleting client pricing',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete client pricing')
  }
}
