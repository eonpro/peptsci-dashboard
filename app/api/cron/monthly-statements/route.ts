/**
 * Monthly statement cron (Vercel Cron: 1st of the month, e.g. `0 14 1 * *`).
 *
 * Emails each client a summary of last month's account activity (opening /
 * invoiced / paid / closing) with a link to the billing portal, where the full
 * statement PDF is available (/api/shop/statements/pdf). Clients with no
 * activity AND a zero balance are skipped. Idempotent per client per month via
 * AuditLog markers, so retries never double-send.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyCronAuth } from '@/lib/cron/auth'
import { buildStatement, monthBounds } from '@/lib/invoicing/statement'
import { sendStatementEmail } from '@/lib/email'
import { appUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const MARKER_ENTITY = 'cron:monthly-statements'

async function alreadySent(clientId: string, monthKey: string): Promise<boolean> {
  if (!prisma) return false
  const marker = await prisma.auditLog.findFirst({
    where: { entity: MARKER_ENTITY, entityId: `${clientId}:${monthKey}` },
    select: { id: true },
  })
  return Boolean(marker)
}

async function recordSent(clientId: string, monthKey: string, meta: Record<string, unknown>) {
  if (!prisma) return
  try {
    await prisma.auditLog.create({
      data: {
        entity: MARKER_ENTITY,
        entityId: `${clientId}:${monthKey}`,
        action: 'STATEMENT_SENT',
        metadata: meta as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    // Unique-marker clash = a concurrent/overlapping run already recorded this
    // send — absorb it so the loop's catch doesn't misreport an error.
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('Unique constraint')) throw err
  }
}

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!prisma) {
    return NextResponse.json({ error: 'Database not connected' }, { status: 503 })
  }

  // Previous calendar month in the business timezone (America/New_York),
  // matching the statement PDF's month bounds so the email summary and the
  // downloadable statement agree.
  const now = new Date()
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
  const monthKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`
  const bounds = monthBounds(monthKey)
  if (!bounds) {
    return NextResponse.json({ error: 'Could not compute statement month' }, { status: 500 })
  }
  const { start, end } = bounds
  const periodLabel = prevMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  // Only clients that have ever been invoiced need statements.
  const clients = await prisma.client.findMany({
    where: { invoices: { some: { status: { notIn: ['VOID', 'DRAFT'] } } } },
    select: { id: true, organizationName: true, contactName: true, contactEmail: true },
  })

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const client of clients) {
    try {
      if (await alreadySent(client.id, monthKey)) {
        skipped++
        continue
      }
      const data = await buildStatement(client.id, start, end)
      if (!data) {
        skipped++
        continue
      }
      const hasActivity = data.lines.length > 0
      const hasBalance = Math.abs(data.closingBalance) >= 0.01
      if (!hasActivity && !hasBalance) {
        skipped++
        continue
      }
      if (!client.contactEmail) {
        skipped++
        continue
      }

      const invoiced = data.lines
        .filter((l) => l.type === 'INVOICE')
        .reduce((sum, l) => sum + l.amount, 0)
      const paid = data.lines
        .filter((l) => l.type === 'PAYMENT')
        .reduce((sum, l) => sum + Math.abs(l.amount), 0)

      const result = await sendStatementEmail({
        to: client.contactEmail,
        customerName: client.contactName || client.organizationName,
        periodLabel,
        openingBalance: usd(data.openingBalance),
        closingBalance: usd(data.closingBalance),
        invoicedThisPeriod: usd(invoiced),
        paidThisPeriod: usd(paid),
        portalUrl: appUrl('/shop/invoices'),
      })
      // Mark even when the email driver skipped (EMAIL_ENABLED off) so a later
      // enable doesn't burst-send stale statements; errors are NOT marked so
      // the next run retries them.
      if (result.ok || result.skipped) {
        await recordSent(client.id, monthKey, {
          closingBalance: data.closingBalance,
          invoiced,
          paid,
          emailSkipped: Boolean(result.skipped),
        })
        sent++
      } else {
        errors.push(`${client.organizationName}: ${result.error ?? 'send failed'}`)
      }
    } catch (e) {
      errors.push(`${client.organizationName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  logger.info('[CRON monthly-statements] done', { monthKey, sent, skipped, errors: errors.length })
  return NextResponse.json({ ok: true, monthKey, sent, skipped, errors })
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
