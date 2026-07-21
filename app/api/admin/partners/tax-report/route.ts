import { NextRequest, NextResponse } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function csvField(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/admin/partners/tax-report?year=YYYY — 1099-friendly CSV of payout
 * totals per payee (org or rep) for the calendar year: legal/contact info,
 * W-9 status, total paid, payout count. Defaults to the previous year (the
 * one you file for in January).
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const yearParam = new URL(request.url).searchParams.get('year')
    const year = yearParam ? Number.parseInt(yearParam, 10) : new Date().getFullYear() - 1
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return errorResponse('Invalid year', 400, 'VALIDATION_ERROR')
    }

    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year + 1, 0, 1))

    const payouts = await prisma.partnerPayout.findMany({
      where: { paidAt: { gte: start, lt: end } },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            contactName: true,
            contactEmail: true,
            w9FileName: true,
            w9UploadedAt: true,
          },
        },
        rep: { select: { id: true, name: true, email: true } },
      },
    })

    // Aggregate per payee: ORG rows key on orgId, REP rows on repId.
    interface Row {
      payeeType: 'ORG' | 'REP'
      orgName: string
      payeeName: string
      payeeEmail: string
      w9OnFile: boolean
      w9UploadedAt: Date | null
      totalCents: number
      payoutCount: number
      methods: Set<string>
    }
    const rows = new Map<string, Row>()
    for (const p of payouts) {
      const key = p.payee === 'REP' && p.repId ? `REP:${p.repId}` : `ORG:${p.orgId}`
      const existing = rows.get(key)
      const base: Row = existing ?? {
        payeeType: p.payee === 'REP' ? 'REP' : 'ORG',
        orgName: p.org.name,
        payeeName:
          p.payee === 'REP' ? (p.rep?.name ?? 'Unknown rep') : (p.org.contactName ?? p.org.name),
        payeeEmail: p.payee === 'REP' ? (p.rep?.email ?? '') : (p.org.contactEmail ?? ''),
        w9OnFile: Boolean(p.org.w9FileName),
        w9UploadedAt: p.org.w9UploadedAt,
        totalCents: 0,
        payoutCount: 0,
        methods: new Set<string>(),
      }
      base.totalCents += p.amountCents
      base.payoutCount += 1
      if (p.method) base.methods.add(p.method)
      rows.set(key, base)
    }

    const header = [
      'Payee Type',
      'Organization',
      'Payee Name',
      'Payee Email',
      'W-9 On File',
      'W-9 Uploaded',
      `Total Paid ${year} (USD)`,
      'Payout Count',
      'Methods',
      'Meets 1099 Threshold ($600)',
    ]
    const lines = [header.join(',')]
    const sorted = [...rows.values()].sort((a, b) => b.totalCents - a.totalCents)
    for (const r of sorted) {
      lines.push(
        [
          r.payeeType,
          csvField(r.orgName),
          csvField(r.payeeName),
          csvField(r.payeeEmail),
          r.w9OnFile ? 'YES' : 'NO',
          r.w9UploadedAt ? r.w9UploadedAt.toISOString().slice(0, 10) : '',
          (r.totalCents / 100).toFixed(2),
          String(r.payoutCount),
          csvField([...r.methods].join('; ')),
          r.totalCents >= 60_000 ? 'YES' : 'NO',
        ].join(',')
      )
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="peptsci-partner-1099-${year}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logger.error('[ADMIN PARTNERS] tax report error', {}, error as Error)
    return errorResponse('Failed to build the tax report')
  }
}
