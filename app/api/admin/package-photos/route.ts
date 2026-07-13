import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { putObject } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

type ResolvedOrder = {
  id: string
  clientId: string
  trackingNumber: string | null
} | null

/**
 * Resolve a PeptSci order from the scanned/typed reference. Tries the numeric
 * orderNumber first, then falls back to the cuid order id.
 */
async function resolveOrder(orderRef: string): Promise<ResolvedOrder> {
  if (!prisma) return null
  const trimmed = orderRef.trim()
  const asNumber = Number(trimmed.replace(/^#/, ''))
  if (Number.isInteger(asNumber) && asNumber > 0) {
    const byNumber = await prisma.order.findFirst({
      where: { orderNumber: asNumber },
      select: { id: true, clientId: true, trackingNumber: true },
    })
    if (byNumber) return byNumber
  }
  const byId = await prisma.order.findUnique({
    where: { id: trimmed },
    select: { id: true, clientId: true, trackingNumber: true },
  })
  return byId
}

async function resolveTracking(order: ResolvedOrder): Promise<{ trackingNumber: string; source: string } | null> {
  if (!order || !prisma) return null
  if (order.trackingNumber) return { trackingNumber: order.trackingNumber, source: 'order' }
  const label = await prisma.shipmentLabel.findFirst({
    where: { orderId: order.id, status: 'CREATED' },
    orderBy: { createdAt: 'desc' },
    select: { trackingNumber: true },
  })
  if (label?.trackingNumber) return { trackingNumber: label.trackingNumber, source: 'fedex_label' }
  return null
}

async function localUserId(clerkUserId: string | null): Promise<string | null> {
  if (!prisma || !clerkUserId || clerkUserId === 'dev-user') return null
  const u = await prisma.user.findUnique({ where: { clerkUserId }, select: { id: true } })
  return u?.id ?? null
}

// ---------------------------------------------------------------------------
// POST — upload a package photo (multipart/form-data)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const formData = await request.formData()
    const orderRef = (formData.get('orderRef') as string | null)?.trim()
    const photo = formData.get('photo') as File | null
    const notes = (formData.get('notes') as string | null)?.trim() || null
    const manualTracking = (formData.get('trackingNumber') as string | null)?.trim() || null

    if (!orderRef) return errorResponse('Order number is required', 400, 'VALIDATION_ERROR')
    if (!photo) return errorResponse('Photo is required', 400, 'VALIDATION_ERROR')
    if (!ALLOWED_MIME.includes(photo.type)) {
      return errorResponse('Invalid file type. Upload JPEG, PNG, or WebP.', 400, 'VALIDATION_ERROR')
    }
    if (photo.size > MAX_FILE_SIZE) {
      return errorResponse('File too large. Maximum size is 10MB.', 400, 'VALIDATION_ERROR')
    }

    const order = await resolveOrder(orderRef)

    let trackingNumber: string | null = null
    let trackingSource: string | null = null
    if (manualTracking) {
      trackingNumber = manualTracking
      trackingSource = 'manual'
    } else {
      const resolved = await resolveTracking(order)
      if (resolved) {
        trackingNumber = resolved.trackingNumber
        trackingSource = resolved.source
      }
    }

    const buffer = Buffer.from(await photo.arrayBuffer())
    const ext = photo.type.split('/')[1] || 'jpg'
    const stored = await putObject(
      `package-photos/pkg-${orderRef}-${Date.now()}.${ext}`,
      buffer,
      photo.type
    )

    const capturedById = await localUserId(userId)

    const record = await prisma.packagePhoto.create({
      data: {
        orderId: order?.id ?? null,
        clientId: order?.clientId ?? null,
        orderRef,
        trackingNumber,
        trackingSource,
        capturedById,
        blobUrl: stored.url ?? null,
        imageBase64: stored.base64 ?? null,
        contentType: photo.type,
        fileSize: photo.size,
        matched: !!order,
        matchedAt: order ? new Date() : null,
        notes,
      },
      select: { id: true, createdAt: true },
    })

    logger.info('[PackagePhoto] captured', {
      id: record.id,
      orderRef,
      matched: !!order,
      trackingNumber: trackingNumber ?? 'none',
      trackingSource: trackingSource ?? 'none',
    })

    return successResponse({
      id: record.id,
      orderRef,
      orderId: order?.id ?? null,
      matched: !!order,
      trackingNumber,
      trackingSource,
      createdAt: record.createdAt,
    })
  } catch (error) {
    logger.error('[PackagePhoto POST] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to upload package photo')
  }
}

// ---------------------------------------------------------------------------
// GET — list / stats
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  search: z.string().optional(),
  matched: z.enum(['true', 'false', 'all']).optional().default('all'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const url = new URL(request.url)

    if (url.searchParams.get('stats') === 'true') {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(todayStart)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const [today, thisWeek, matched, total] = await Promise.all([
        prisma.packagePhoto.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.packagePhoto.count({ where: { createdAt: { gte: weekStart } } }),
        prisma.packagePhoto.count({ where: { matched: true } }),
        prisma.packagePhoto.count(),
      ])
      return successResponse({
        today,
        thisWeek,
        matched,
        total,
        matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
        unmatched: total - matched,
      })
    }

    const params = searchSchema.parse(Object.fromEntries(url.searchParams))
    const where: Record<string, unknown> = {}
    if (params.search) {
      where.OR = [
        { orderRef: { contains: params.search, mode: 'insensitive' } },
        { trackingNumber: { contains: params.search, mode: 'insensitive' } },
      ]
    }
    if (params.matched === 'true') where.matched = true
    else if (params.matched === 'false') where.matched = false

    const [photos, total] = await Promise.all([
      prisma.packagePhoto.findMany({
        where,
        select: {
          id: true,
          orderRef: true,
          orderId: true,
          trackingNumber: true,
          trackingSource: true,
          matched: true,
          notes: true,
          contentType: true,
          createdAt: true,
          capturedBy: { select: { firstName: true, lastName: true, email: true } },
          order: { select: { orderNumber: true, status: true } },
          client: { select: { organizationName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.packagePhoto.count({ where }),
    ])

    return successResponse({
      data: photos,
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) },
    })
  } catch (error) {
    logger.error('[PackagePhoto GET] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list package photos')
  }
}
