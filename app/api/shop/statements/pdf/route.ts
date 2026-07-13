import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { buildStatement, monthBounds } from '@/lib/invoicing/statement'
import { generateStatementPdf } from '@/lib/invoicing/statement-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/statements/pdf?month=YYYY-MM — the caller's own monthly
 * account statement (defaults to the previous calendar month).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const now = new Date()
    const prevMonth =
      now.getUTCMonth() === 0
        ? `${now.getUTCFullYear() - 1}-12`
        : `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2, '0')}`
    const month = request.nextUrl.searchParams.get('month') ?? prevMonth

    const bounds = monthBounds(month)
    if (!bounds) return errorResponse('Invalid month (use YYYY-MM)', 400, 'INVALID_MONTH')

    const data = await buildStatement(clientId, bounds.start, bounds.end)
    if (!data) return errorResponse('Account not found', 404, 'NOT_FOUND')

    const pdf = await generateStatementPdf(data)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-statement-${month}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[shop/statements/pdf] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to generate statement')
  }
}
