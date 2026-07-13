import { NextRequest, NextResponse } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { buildStatement, monthBounds } from '@/lib/invoicing/statement'
import { generateStatementPdf } from '@/lib/invoicing/statement-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/clients/[id]/statement?month=YYYY-MM — monthly account
 * statement PDF (defaults to the previous calendar month).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const now = new Date()
    const prevMonth =
      now.getUTCMonth() === 0
        ? `${now.getUTCFullYear() - 1}-12`
        : `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2, '0')}`
    const month = request.nextUrl.searchParams.get('month') ?? prevMonth

    const bounds = monthBounds(month)
    if (!bounds) return errorResponse('Invalid month (use YYYY-MM)', 400, 'INVALID_MONTH')

    const data = await buildStatement(id, bounds.start, bounds.end)
    if (!data) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const pdf = await generateStatementPdf(data)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-statement-${month}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[admin/clients/:id/statement] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to generate statement')
  }
}
