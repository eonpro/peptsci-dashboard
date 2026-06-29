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
import { getReportsDashboard } from '@/lib/reports/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const query = z.object({ days: z.coerce.number().int().min(7).max(365).optional().default(30) })

/** GET /api/admin/reports?days=30 — full reporting dashboard payload. Admin. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { days } = query.parse(Object.fromEntries(new URL(request.url).searchParams))
    const report = await getReportsDashboard(days)
    return successResponse({ report })
  } catch (error) {
    logger.error('[admin/reports] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to build reports')
  }
}
