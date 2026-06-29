import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { buildSalesCsv, buildInventoryCsv, buildArAgingCsv } from '@/lib/reports/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILDERS: Record<string, () => Promise<string>> = {
  sales: buildSalesCsv,
  inventory: buildInventoryCsv,
  ar: buildArAgingCsv,
}

/** GET /api/admin/reports/export?type=sales|inventory|ar — Excel-friendly CSV. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const type = new URL(request.url).searchParams.get('type') ?? 'sales'
    const builder = BUILDERS[type]
    if (!builder) return errorResponse('Unknown export type', 400, 'BAD_TYPE')

    const csv = await builder()
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="peptsci-${type}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[admin/reports/export] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to export report')
  }
}
