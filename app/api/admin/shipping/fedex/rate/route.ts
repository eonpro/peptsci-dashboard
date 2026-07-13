import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getCredentials, getRateQuote } from '@/lib/fedex'
import { isValidServiceType } from '@/lib/fedex-services'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const partialAddress = z.object({
  address1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1).max(2),
  zip: z.string().min(1),
  countryCode: z.string().optional(),
  residential: z.boolean().optional(),
})

const bodySchema = z.object({
  origin: partialAddress,
  destination: partialAddress,
  serviceType: z.string().min(1),
  packagingType: z.string().default('YOUR_PACKAGING'),
  weightLbs: z.number().positive().max(150).default(1),
  oneRate: z.boolean().default(false),
})

/**
 * POST /api/admin/shipping/fedex/rate
 * Get a FedEx rate quote for a prospective shipment. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }
    const data = parsed.data

    if (!isValidServiceType(data.serviceType)) {
      return errorResponse(`Invalid service type: ${data.serviceType}`, 400, 'VALIDATION_ERROR')
    }

    const credentials = getCredentials()
    if (!credentials) {
      return errorResponse('FedEx is not configured. Contact your administrator.', 422, 'FEDEX_UNCONFIGURED')
    }

    const quote = await getRateQuote(credentials, {
      serviceType: data.serviceType,
      packagingType: data.packagingType,
      shipper: {
        personName: 'Shipper',
        phoneNumber: '0000000000',
        address1: data.origin.address1,
        city: data.origin.city,
        state: data.origin.state.toUpperCase(),
        zip: data.origin.zip,
        countryCode: data.origin.countryCode,
      },
      recipient: {
        personName: 'Recipient',
        phoneNumber: '0000000000',
        address1: data.destination.address1,
        city: data.destination.city,
        state: data.destination.state.toUpperCase(),
        zip: data.destination.zip,
        countryCode: data.destination.countryCode,
        residential: data.destination.residential ?? true,
      },
      packages: [{ weightLbs: data.weightLbs }],
      oneRate: data.oneRate,
    })

    return successResponse(quote)
  } catch (error) {
    logger.warn('[FedEx rate] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return errorResponse('Failed to get FedEx rate quote', 502, 'FEDEX_ERROR')
  }
}
