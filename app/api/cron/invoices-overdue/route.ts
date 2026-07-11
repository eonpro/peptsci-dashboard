/**
 * Overdue-invoice cron (Vercel Cron: daily, e.g. `0 13 * * *`).
 *
 * Flips OPEN/PARTIAL invoices that are past their due date to OVERDUE and emails
 * each client a past-due reminder. Email sends are non-blocking and no-op when
 * EMAIL_ENABLED is unset.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyCronAuth } from '@/lib/cron/auth'
import { markOverdueInvoices } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { nyDayString } from '@/lib/reports/core'
import { sendInvoiceOverdueEmail } from '@/lib/email'
import { sendInvoiceOverdueSms } from '@/lib/sms'
import { appUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

// Send-idempotency markers, stored in AuditLog (entity/entityId indexed):
// one marker per invoice per NY calendar day, so retries or overlapping runs
// on the same day never re-notify a client. Check-before-send narrows the
// race; a DB unique index on AuditLog(entity, entityId) would make it fully
// atomic (recommended follow-up).
const MARKER_ENTITY = 'cron:invoices-overdue'

async function alreadyNotified(invoiceId: string, dayKey: string): Promise<boolean> {
  if (!prisma) return false
  const marker = await prisma.auditLog.findFirst({
    where: { entity: MARKER_ENTITY, entityId: `${invoiceId}:${dayKey}` },
    select: { id: true },
  })
  return Boolean(marker)
}

async function recordNotified(
  invoiceId: string,
  dayKey: string,
  meta: Record<string, unknown>
): Promise<void> {
  if (!prisma) return
  await prisma.auditLog.create({
    data: {
      entity: MARKER_ENTITY,
      entityId: `${invoiceId}:${dayKey}`,
      action: 'NOTIFIED',
      metadata: meta as Prisma.InputJsonValue,
    },
  })
}

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const flipped = await markOverdueInvoices()
    const dayKey = nyDayString(new Date())
    const seenThisRun = new Set<string>()
    let emailed = 0
    let texted = 0
    let skippedDuplicates = 0
    for (const view of flipped) {
      // In-run + same-day dedup: never notify the same invoice twice.
      if (seenThisRun.has(view.invoice.id) || (await alreadyNotified(view.invoice.id, dayKey))) {
        skippedDuplicates += 1
        continue
      }
      seenThisRun.add(view.invoice.id)

      const invoiceNumber = formatInvoiceNumber(view.invoice.invoiceNumber)
      const amountDue = usd(view.totals.amountDue)
      const dueDate = view.invoice.dueDate
        ? new Date(view.invoice.dueDate).toISOString().slice(0, 10)
        : '—'

      let emailOk = false
      let smsOk = false

      const to = view.invoice.client?.contactEmail
      if (to) {
        const result = await sendInvoiceOverdueEmail({
          to,
          customerName: view.invoice.client?.organizationName,
          invoiceNumber,
          amountDue,
          dueDate,
          daysPastDue: view.daysPastDue,
          // "View invoice" → the client portal, where they can pay online.
          invoiceUrl: appUrl('/shop/invoices'),
        }).catch((e) => {
          logger.warn('[CRON invoices-overdue] email failed (non-blocking)', {
            invoiceId: view.invoice.id,
            error: e instanceof Error ? e.message : String(e),
          })
          return { ok: false }
        })
        if (result.ok) {
          emailOk = true
          emailed += 1
        }
      }

      const phone = view.invoice.client?.contactPhone
      if (phone) {
        const sms = await sendInvoiceOverdueSms({
          to: phone,
          invoiceNumber,
          amountDue,
          dueDate,
        }).catch((e) => {
          logger.warn('[CRON invoices-overdue] SMS failed (non-blocking)', {
            invoiceId: view.invoice.id,
            error: e instanceof Error ? e.message : String(e),
          })
          return { ok: false }
        })
        if (sms.ok) {
          smsOk = true
          texted += 1
        }
      }

      // Only mark as notified when at least one channel actually went out, so
      // an all-channels-failed invoice can be retried on the next run.
      if (emailOk || smsOk) {
        await recordNotified(view.invoice.id, dayKey, { invoiceNumber, emailOk, smsOk }).catch(
          (e) => {
            logger.warn('[CRON invoices-overdue] failed to record send marker', {
              invoiceId: view.invoice.id,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        )
      }
    }
    logger.info('[CRON invoices-overdue] complete', {
      flipped: flipped.length,
      emailed,
      texted,
      skippedDuplicates,
    })
    return NextResponse.json({
      ok: true,
      flipped: flipped.length,
      emailed,
      texted,
      skippedDuplicates,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'overdue sweep failed'
    logger.error('[CRON invoices-overdue] error', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
