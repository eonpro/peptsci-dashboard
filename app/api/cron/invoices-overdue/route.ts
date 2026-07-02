/**
 * Overdue-invoice cron (Vercel Cron: daily, e.g. `0 13 * * *`).
 *
 * Flips OPEN/PARTIAL invoices that are past their due date to OVERDUE and emails
 * each client a past-due reminder. Email sends are non-blocking and no-op when
 * EMAIL_ENABLED is unset.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { verifyCronAuth } from '@/lib/cron/auth'
import { markOverdueInvoices } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { sendInvoiceOverdueEmail } from '@/lib/email'
import { sendInvoiceOverdueSms } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const flipped = await markOverdueInvoices()
    let emailed = 0
    let texted = 0
    for (const view of flipped) {
      const invoiceNumber = formatInvoiceNumber(view.invoice.invoiceNumber)
      const amountDue = usd(view.totals.amountDue)
      const dueDate = view.invoice.dueDate
        ? new Date(view.invoice.dueDate).toISOString().slice(0, 10)
        : '—'

      const to = view.invoice.client?.contactEmail
      if (to) {
        const result = await sendInvoiceOverdueEmail({
          to,
          customerName: view.invoice.client?.organizationName,
          invoiceNumber,
          amountDue,
          dueDate,
          daysPastDue: view.daysPastDue,
        }).catch((e) => {
          logger.warn('[CRON invoices-overdue] email failed (non-blocking)', {
            invoiceId: view.invoice.id,
            error: e instanceof Error ? e.message : String(e),
          })
          return { ok: false }
        })
        if (result.ok) emailed += 1
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
        if (sms.ok) texted += 1
      }
    }
    logger.info('[CRON invoices-overdue] complete', { flipped: flipped.length, emailed, texted })
    return NextResponse.json({ ok: true, flipped: flipped.length, emailed, texted })
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
