// Branded HTML + plain-text email templates for the partner account lifecycle.
// Inline styles only (email clients strip <style>/external CSS). Palette matches
// the PeptSci brand: navy #050722, blue #213cef, cream #F2F0EA.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')
const SUPPORT_EMAIL = process.env.EMAIL_REPLY_TO || 'support@peptsci.com'

export interface EmailContent {
  subject: string
  html: string
  text: string
}

const BRAND = {
  navy: '#050722',
  blue: '#213cef',
  cream: '#F2F0EA',
  text: '#1a1a2e',
  muted: '#6b7280',
}

/**
 * Escape user-controlled values before interpolating them into email HTML.
 * Apply to any name, address, reason/message, or product string coming from
 * user input; never to intentional HTML structure (paras, panels, CTAs).
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Shared responsive shell. `body` is trusted, pre-escaped HTML. */
function layout(opts: { heading: string; body: string; cta?: { label: string; href: string } }): string {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${opts.cta.href}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;font-size:15px;">${opts.cta.label}</a>
       </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 18px 60px -30px rgba(33,60,239,0.35);">
        <tr><td style="background:${BRAND.navy};padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">PEPTSCI</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.text};">${opts.heading}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="color:${BRAND.text};font-size:15px;line-height:1.6;">
            ${opts.body}
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid #eee;color:${BRAND.muted};font-size:13px;line-height:1.5;">
          Questions? Reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND.blue};text-decoration:none;">${SUPPORT_EMAIL}</a>.<br>
          &copy; ${new Date().getFullYear()} PeptSci. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function para(text: string): string {
  return `<tr><td style="padding:0 0 14px;">${text}</td></tr>`
}

/** A boxed key/value detail panel (order #, tracking #, carrier). Values are escaped here. */
function detailPanel(rows: Array<[string, string]>): string {
  const inner = rows
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 0;color:${BRAND.muted};font-size:13px;white-space:nowrap;">${escapeHtml(k)}</td>
           <td style="padding:6px 0 6px 16px;color:${BRAND.text};font-size:14px;font-weight:600;text-align:right;">${escapeHtml(v)}</td>
         </tr>`
    )
    .join('')
  return `<tr><td style="padding:4px 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:12px;padding:8px 18px;">
      ${inner}
    </table>
  </td></tr>`
}

// Plain-text greeting (for the text/plain body).
const greeting = (name?: string | null) => (name && name.trim() ? `Hi ${name.trim()},` : 'Hello,')
// HTML greeting — the name is user-controlled, so escape it.
const greetingHtml = (name?: string | null) =>
  name && name.trim() ? `Hi ${escapeHtml(name.trim())},` : 'Hello,'

/** Public tracking page link for a tracking number (see app/tracking/[trackingNumber]). */
function trackingPageUrl(trackingNumber: string): string {
  return `${APP_URL}/tracking/${encodeURIComponent(trackingNumber)}`
}

function orderLabel(orderNumber: number | string): string {
  return `#${orderNumber}`
}

export function welcomeEmail(opts: { firstName?: string | null }): EmailContent {
  const subject = 'Welcome to PeptSci — your account is under review'
  const html = layout({
    heading: 'Welcome to PeptSci',
    body:
      para(greetingHtml(opts.firstName)) +
      para('Thanks for creating your PeptSci account. Our team is reviewing your registration to verify your practice credentials.') +
      para('You&rsquo;ll receive another email as soon as your account is approved and ready to place orders. This usually takes 1&ndash;2 business days.'),
    cta: { label: 'View your account', href: `${APP_URL}/pending-approval` },
  })
  const text = `${greeting(opts.firstName)}

Thanks for creating your PeptSci account. Our team is reviewing your registration to verify your practice credentials.

You'll receive another email as soon as your account is approved and ready to place orders (usually 1-2 business days).

Account: ${APP_URL}/pending-approval

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerApprovedEmail(opts: { name?: string | null }): EmailContent {
  const subject = 'Your PeptSci account is approved'
  const html = layout({
    heading: 'You&rsquo;re approved! 🎉',
    body:
      para(greetingHtml(opts.name)) +
      para('Great news — your PeptSci partner account has been approved. You now have full access to browse the catalog, view your pricing, and place orders.') +
      para('Sign in to get started.'),
    cta: { label: 'Go to your portal', href: `${APP_URL}/shop` },
  })
  const text = `${greeting(opts.name)}

Great news — your PeptSci partner account has been approved. You now have full access to browse the catalog, view your pricing, and place orders.

Sign in to get started: ${APP_URL}/shop

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerRejectedEmail(opts: { name?: string | null; reason?: string }): EmailContent {
  const subject = 'Update on your PeptSci application'
  const reasonBlock = opts.reason
    ? para(`<strong>Reason:</strong> ${escapeHtml(opts.reason)}`)
    : ''
  const html = layout({
    heading: 'Update on your application',
    body:
      para(greetingHtml(opts.name)) +
      para('Thank you for your interest in partnering with PeptSci. After review, we&rsquo;re unable to approve your account at this time.') +
      reasonBlock +
      para(`If you believe this was a mistake or have additional documentation, please reply to this email or contact us at ${SUPPORT_EMAIL}.`),
  })
  const text = `${greeting(opts.name)}

Thank you for your interest in partnering with PeptSci. After review, we're unable to approve your account at this time.
${opts.reason ? `\nReason: ${opts.reason}\n` : ''}
If you believe this was a mistake or have additional documentation, contact us at ${SUPPORT_EMAIL}.

© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerNeedsInfoEmail(opts: { name?: string | null; message?: string }): EmailContent {
  const subject = 'Action needed: more information for your PeptSci application'
  const messageBlock = opts.message
    ? para(`<strong>What we need:</strong> ${escapeHtml(opts.message)}`)
    : para('Please sign in to review what&rsquo;s needed and update your details.')
  const html = layout({
    heading: 'We need a bit more information',
    body:
      para(greetingHtml(opts.name)) +
      para('We&rsquo;re reviewing your PeptSci application and need some additional information before we can approve your account.') +
      messageBlock,
    cta: { label: 'Update your application', href: `${APP_URL}/onboarding` },
  })
  const text = `${greeting(opts.name)}

We're reviewing your PeptSci application and need some additional information before we can approve your account.
${opts.message ? `\nWhat we need: ${opts.message}\n` : ''}
Update your application: ${APP_URL}/onboarding

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// -------------------------------------------------
// Order confirmation (customer-facing): sent when an order is placed (card
// captured or billed to account). Carries line items + totals, no PHI.
// -------------------------------------------------

export interface OrderConfirmationEmailOpts {
  customerName?: string | null
  orderNumber: number | string
  /** Pre-formatted line totals (e.g. "$180.00"). */
  items: Array<{ name: string; dose?: string | null; quantity: number; lineTotal: string }>
  subtotal: string
  shipping: string
  total: string
  /** e.g. "Paid by card" or "Billed to account — Net 30". */
  paymentLabel: string
}

export function orderConfirmationEmail(opts: OrderConfirmationEmailOpts): EmailContent {
  const ord = orderLabel(opts.orderNumber)
  const subject = `Your PeptSci order ${ord} is confirmed`

  const itemRowsHtml = opts.items
    .map(
      (it) =>
        `<tr>
           <td style="padding:6px 0;color:${BRAND.text};font-size:14px;">
             ${escapeHtml(it.name)}${it.dose ? ` <span style="color:${BRAND.muted};">${escapeHtml(it.dose)}</span>` : ''}
             <span style="color:${BRAND.muted};"> × ${escapeHtml(it.quantity)}</span>
           </td>
           <td style="padding:6px 0 6px 16px;color:${BRAND.text};font-size:14px;font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(it.lineTotal)}</td>
         </tr>`
    )
    .join('')

  const itemsPanel = `<tr><td style="padding:4px 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:12px;padding:8px 18px;">
      ${itemRowsHtml}
      <tr><td colspan="2" style="border-top:1px solid #e2e0d8;padding:0;"></td></tr>
      <tr>
        <td style="padding:8px 0 2px;color:${BRAND.muted};font-size:13px;">Subtotal</td>
        <td style="padding:8px 0 2px 16px;color:${BRAND.text};font-size:14px;text-align:right;">${escapeHtml(opts.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;color:${BRAND.muted};font-size:13px;">Shipping</td>
        <td style="padding:2px 0 2px 16px;color:${BRAND.text};font-size:14px;text-align:right;">${escapeHtml(opts.shipping)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${BRAND.text};font-size:14px;font-weight:700;">Total</td>
        <td style="padding:6px 0 6px 16px;color:${BRAND.text};font-size:15px;font-weight:700;text-align:right;">${escapeHtml(opts.total)}</td>
      </tr>
    </table>
  </td></tr>`

  const html = layout({
    heading: 'Order confirmed ✅',
    body:
      para(greetingHtml(opts.customerName)) +
      para(
        `Thanks for your order! We&rsquo;ve received PeptSci order ${escapeHtml(ord)} (${escapeHtml(opts.paymentLabel)}) and our team is preparing it for fulfillment.`
      ) +
      itemsPanel +
      para('You&rsquo;ll get another email with tracking as soon as it ships.'),
    cta: { label: 'View your order', href: `${APP_URL}/shop/orders` },
  })

  const itemLines = opts.items
    .map((it) => `- ${it.name}${it.dose ? ` ${it.dose}` : ''} × ${it.quantity} — ${it.lineTotal}`)
    .join('\n')
  const text = `${greeting(opts.customerName)}

Thanks for your order! We've received PeptSci order ${ord} (${opts.paymentLabel}) and our team is preparing it for fulfillment.

${itemLines}

Subtotal: ${opts.subtotal}
Shipping: ${opts.shipping}
Total: ${opts.total}

You'll get another email with tracking as soon as it ships.

View your orders: ${APP_URL}/shop/orders

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// -------------------------------------------------
// Shipment lifecycle (customer-facing): shipped / delivered / exception.
// Sent to the practice's contact email. Carry no PHI — order number + tracking
// only. CTA points at the public tracking page (app/tracking/[trackingNumber]).
// -------------------------------------------------

export interface ShipmentEmailOpts {
  customerName?: string | null
  orderNumber: number | string
  trackingNumber: string
  carrier?: string | null
  /** Optional ETA, pre-formatted for display (e.g. "Tue, Jul 1"). */
  eta?: string | null
}

export function orderShippedEmail(opts: ShipmentEmailOpts): EmailContent {
  const carrier = opts.carrier?.trim() || 'FedEx'
  const ord = orderLabel(opts.orderNumber)
  const subject = `Your PeptSci order ${ord} has shipped`
  const rows: Array<[string, string]> = [
    ['Order', ord],
    ['Carrier', carrier],
    ['Tracking #', opts.trackingNumber],
  ]
  if (opts.eta) rows.push(['Estimated delivery', opts.eta])
  const html = layout({
    heading: 'Your order is on its way 📦',
    body:
      para(greetingHtml(opts.customerName)) +
      para(`Good news — your PeptSci order ${escapeHtml(ord)} has shipped via ${escapeHtml(carrier)}.`) +
      detailPanel(rows) +
      para('You can follow its progress with the button below.'),
    cta: { label: 'Track your shipment', href: trackingPageUrl(opts.trackingNumber) },
  })
  const text = `${greeting(opts.customerName)}

Good news — your PeptSci order ${ord} has shipped via ${carrier}.

Order: ${ord}
Carrier: ${carrier}
Tracking #: ${opts.trackingNumber}${opts.eta ? `\nEstimated delivery: ${opts.eta}` : ''}

Track your shipment: ${trackingPageUrl(opts.trackingNumber)}

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function orderDeliveredEmail(opts: ShipmentEmailOpts): EmailContent {
  const carrier = opts.carrier?.trim() || 'FedEx'
  const ord = orderLabel(opts.orderNumber)
  const subject = `Your PeptSci order ${ord} was delivered`
  const html = layout({
    heading: 'Delivered ✅',
    body:
      para(greetingHtml(opts.customerName)) +
      para(`Your PeptSci order ${escapeHtml(ord)} was delivered by ${escapeHtml(carrier)}.`) +
      detailPanel([
        ['Order', ord],
        ['Carrier', carrier],
        ['Tracking #', opts.trackingNumber],
      ]) +
      para(`If anything looks wrong with your delivery, reply to this email or contact us at ${SUPPORT_EMAIL}.`),
    cta: { label: 'View delivery details', href: trackingPageUrl(opts.trackingNumber) },
  })
  const text = `${greeting(opts.customerName)}

Your PeptSci order ${ord} was delivered by ${carrier}.

Order: ${ord}
Carrier: ${carrier}
Tracking #: ${opts.trackingNumber}

Delivery details: ${trackingPageUrl(opts.trackingNumber)}

If anything looks wrong, contact us at ${SUPPORT_EMAIL}.
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// -------------------------------------------------
// Billing & invoicing (account-facing): invoice issued + overdue reminder.
// Sent to the practice's billing/contact email. No PHI — invoice number,
// amounts, and due date only.
// -------------------------------------------------

export interface InvoiceEmailOpts {
  customerName?: string | null
  invoiceNumber: string
  amountDue: string
  dueDate: string
  /** Optional link to a hosted/printable invoice. */
  invoiceUrl?: string | null
}

export function invoiceIssuedEmail(opts: InvoiceEmailOpts): EmailContent {
  const subject = `PeptSci invoice ${opts.invoiceNumber} — ${opts.amountDue} due ${opts.dueDate}`
  const html = layout({
    heading: `Invoice ${opts.invoiceNumber}`,
    body:
      para(greetingHtml(opts.customerName)) +
      para('A new invoice is available for your PeptSci account. A summary is below.') +
      detailPanel([
        ['Invoice', opts.invoiceNumber],
        ['Amount due', opts.amountDue],
        ['Due date', opts.dueDate],
      ]) +
      para('Please remit payment by the due date. Reach out if you have any questions about this invoice.'),
    cta: opts.invoiceUrl ? { label: 'View invoice', href: opts.invoiceUrl } : undefined,
  })
  const text = `${greeting(opts.customerName)}

A new invoice is available for your PeptSci account.

Invoice: ${opts.invoiceNumber}
Amount due: ${opts.amountDue}
Due date: ${opts.dueDate}
${opts.invoiceUrl ? `\nView invoice: ${opts.invoiceUrl}\n` : ''}
Please remit payment by the due date. Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function invoiceOverdueEmail(opts: InvoiceEmailOpts & { daysPastDue: number }): EmailContent {
  const subject = `Past due: PeptSci invoice ${opts.invoiceNumber} (${opts.amountDue})`
  const html = layout({
    heading: 'Payment past due',
    body:
      para(greetingHtml(opts.customerName)) +
      para(
        `Our records show invoice ${opts.invoiceNumber} is now <strong>${opts.daysPastDue} day(s) past due</strong>. Please arrange payment at your earliest convenience.`
      ) +
      detailPanel([
        ['Invoice', opts.invoiceNumber],
        ['Amount due', opts.amountDue],
        ['Due date', opts.dueDate],
      ]) +
      para(`If you have already sent payment, thank you — please disregard this notice or contact us at ${SUPPORT_EMAIL}.`),
    cta: opts.invoiceUrl ? { label: 'View invoice', href: opts.invoiceUrl } : undefined,
  })
  const text = `${greeting(opts.customerName)}

Invoice ${opts.invoiceNumber} is now ${opts.daysPastDue} day(s) past due. Please arrange payment at your earliest convenience.

Invoice: ${opts.invoiceNumber}
Amount due: ${opts.amountDue}
Due date: ${opts.dueDate}
${opts.invoiceUrl ? `\nView invoice: ${opts.invoiceUrl}\n` : ''}
If you have already sent payment, thank you — please disregard. Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// -------------------------------------------------
// Monthly account statement (client-facing).
// -------------------------------------------------

export interface StatementEmailOpts {
  customerName?: string | null
  /** e.g. "June 2026" */
  periodLabel: string
  openingBalance: string
  closingBalance: string
  invoicedThisPeriod: string
  paidThisPeriod: string
  /** Link to the client billing portal. */
  portalUrl?: string | null
}

export function statementEmail(opts: StatementEmailOpts): EmailContent {
  const subject = `Your PeptSci account statement — ${opts.periodLabel}`
  const html = layout({
    heading: `Account statement · ${opts.periodLabel}`,
    body:
      para(greetingHtml(opts.customerName)) +
      para('Here is a summary of your PeptSci account activity for the period. Your full statement PDF is available from your billing portal.') +
      detailPanel([
        ['Opening balance', opts.openingBalance],
        ['Invoiced', opts.invoicedThisPeriod],
        ['Payments received', opts.paidThisPeriod],
        ['Closing balance', opts.closingBalance],
      ]) +
      para('Thank you for your business. If anything on this statement looks off, just reply to this email.'),
    cta: opts.portalUrl ? { label: 'View invoices & statement', href: opts.portalUrl } : undefined,
  })
  const text = `${greeting(opts.customerName)}

Your PeptSci account statement for ${opts.periodLabel}:

Opening balance: ${opts.openingBalance}
Invoiced: ${opts.invoicedThisPeriod}
Payments received: ${opts.paidThisPeriod}
Closing balance: ${opts.closingBalance}
${opts.portalUrl ? `\nView invoices & statement: ${opts.portalUrl}\n` : ''}
Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// -------------------------------------------------
// Weekly business report (internal/admin-facing): revenue, AR, SLA, stock.
// -------------------------------------------------

export interface WeeklyReportEmailOpts {
  weekRange: string
  revenue: string
  revenueDelta: string
  orders: number
  units: number
  arOutstanding: string
  arOverdue: string
  slaPct: string
  lowStockCount: number
  outOfStockCount: number
  topProducts: Array<{ name: string; revenue: string }>
  dashboardUrl?: string
}

export function weeklyReportEmail(opts: WeeklyReportEmailOpts): EmailContent {
  const subject = `PeptSci weekly report — ${opts.weekRange}`
  const topRows =
    opts.topProducts.length > 0
      ? opts.topProducts
          .map(
            (p) =>
              `<tr><td style="padding:4px 0;color:${BRAND.text};font-size:13px;">${escapeHtml(p.name)}</td>
               <td style="padding:4px 0;text-align:right;color:${BRAND.text};font-size:13px;font-weight:600;">${escapeHtml(p.revenue)}</td></tr>`
          )
          .join('')
      : `<tr><td style="padding:4px 0;color:${BRAND.muted};font-size:13px;">No sales this week.</td></tr>`

  const html = layout({
    heading: `Weekly report`,
    body:
      para(`Here's your PeptSci summary for <strong>${opts.weekRange}</strong>.`) +
      detailPanel([
        ['Revenue', `${opts.revenue} (${opts.revenueDelta} vs prior week)`],
        ['Orders', String(opts.orders)],
        ['Units', String(opts.units)],
        ['AR outstanding', opts.arOutstanding],
        ['AR overdue', opts.arOverdue],
        ['Ship-within-SLA', opts.slaPct],
        ['Low / out of stock', `${opts.lowStockCount} low · ${opts.outOfStockCount} out`],
      ]) +
      `<tr><td style="padding:6px 0 4px;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:0.4px;">Top products</td></tr>` +
      `<tr><td style="padding:0 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${topRows}</table></td></tr>`,
    cta: opts.dashboardUrl ? { label: 'Open reports', href: opts.dashboardUrl } : undefined,
  })

  const text = `PeptSci weekly report — ${opts.weekRange}

Revenue: ${opts.revenue} (${opts.revenueDelta} vs prior week)
Orders: ${opts.orders}
Units: ${opts.units}
AR outstanding: ${opts.arOutstanding}
AR overdue: ${opts.arOverdue}
Ship-within-SLA: ${opts.slaPct}
Low/out of stock: ${opts.lowStockCount} low, ${opts.outOfStockCount} out

Top products:
${opts.topProducts.map((p) => `- ${p.name}: ${p.revenue}`).join('\n') || '- No sales this week.'}
${opts.dashboardUrl ? `\nReports: ${opts.dashboardUrl}\n` : ''}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function orderExceptionEmail(opts: ShipmentEmailOpts): EmailContent {
  const carrier = opts.carrier?.trim() || 'FedEx'
  const ord = orderLabel(opts.orderNumber)
  const subject = `Update on your PeptSci order ${ord}`
  const html = layout({
    heading: 'There&rsquo;s a delay with your shipment',
    body:
      para(greetingHtml(opts.customerName)) +
      para(`${escapeHtml(carrier)} reported a delivery exception for your PeptSci order ${escapeHtml(ord)}. This can happen due to weather, an address issue, or a missed delivery attempt.`) +
      detailPanel([
        ['Order', ord],
        ['Carrier', carrier],
        ['Tracking #', opts.trackingNumber],
      ]) +
      para(`Check the latest status below. If you need help, reply to this email or contact us at ${SUPPORT_EMAIL}.`),
    cta: { label: 'Check shipment status', href: trackingPageUrl(opts.trackingNumber) },
  })
  const text = `${greeting(opts.customerName)}

${carrier} reported a delivery exception for your PeptSci order ${ord}. This can happen due to weather, an address issue, or a missed delivery attempt.

Order: ${ord}
Carrier: ${carrier}
Tracking #: ${opts.trackingNumber}

Check shipment status: ${trackingPageUrl(opts.trackingNumber)}

Need help? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

// ── Affiliate partner program (sales orgs / reps — not clinic accounts) ──

export function affiliateApplicationReceivedEmail(opts: {
  contactName?: string | null
  orgName: string
  reference?: string
}): EmailContent {
  const subject = opts.reference
    ? `We received your PeptSci partner application (${opts.reference})`
    : 'We received your PeptSci partner application'
  const refBlock = opts.reference ? detailPanel([['Application #', opts.reference]]) : ''
  const html = layout({
    heading: 'Application received',
    body:
      para(greetingHtml(opts.contactName)) +
      para(
        `Thanks for applying to the PeptSci partner program on behalf of <strong>${escapeHtml(opts.orgName)}</strong>. Our team reviews every application and will follow up shortly — usually within 1&ndash;2 business days.`
      ) +
      refBlock +
      para('Once approved, you&rsquo;ll receive an invitation to set up your partner portal login.'),
  })
  const text = `${greeting(opts.contactName)}

Thanks for applying to the PeptSci partner program on behalf of ${opts.orgName}. Our team reviews every application and will follow up shortly — usually within 1-2 business days.
${opts.reference ? `\nApplication #: ${opts.reference}\n` : ''}
Once approved, you'll receive an invitation to set up your partner portal login.

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

/**
 * Bulleted "what you can do" list for partner onboarding emails.
 * Items are trusted, pre-escaped HTML strings.
 */
function bulletList(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
           <td style="padding:4px 0;vertical-align:top;width:22px;color:${BRAND.blue};font-weight:700;">&bull;</td>
           <td style="padding:4px 0;color:${BRAND.text};font-size:14px;line-height:1.55;">${item}</td>
         </tr>`
    )
    .join('')
  return `<tr><td style="padding:2px 0 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:12px;padding:12px 18px;">
      ${rows}
    </table>
  </td></tr>`
}

const PARTNER_PORTAL_BULLETS = [
  `<strong>Create referral links</strong> — share them with clinics and every sign-up is attributed to you automatically.`,
  `<strong>Invite your reps</strong> — give each rep their own login, links, and commission rate.`,
  `<strong>Track commissions live</strong> — see attributed clinics, revenue, and your unpaid balance in real time.`,
]

const PARTNER_PORTAL_BULLETS_TEXT = [
  '- Create referral links — share them with clinics and every sign-up is attributed to you automatically.',
  '- Invite your reps — give each rep their own login, links, and commission rate.',
  '- Track commissions live — see attributed clinics, revenue, and your unpaid balance in real time.',
].join('\n')

export function affiliateApprovedEmail(opts: {
  contactName?: string | null
  orgName: string
  /** Clerk accept-invitation link. When present this email IS the invitation. */
  inviteUrl?: string | null
  /**
   * The applicant already had a PeptSci login that was granted partner access
   * — no invitation is coming; they just sign in.
   */
  existingAccount?: boolean
}): EmailContent {
  const subject = 'Your PeptSci partner application is approved'

  if (opts.existingAccount) {
    const html = layout({
      heading: 'Welcome to the partner program! 🎉',
      body:
        para(greetingHtml(opts.contactName)) +
        para(
          `Great news — <strong>${escapeHtml(opts.orgName)}</strong> has been approved for the PeptSci partner program. Your existing PeptSci login now has partner access, so there&rsquo;s nothing to set up — just sign in.`
        ) +
        para('Once you&rsquo;re in, here&rsquo;s what you can do:') +
        bulletList(PARTNER_PORTAL_BULLETS),
      cta: { label: 'Sign in to your partner portal', href: `${APP_URL}/partners` },
    })
    const text = `${greeting(opts.contactName)}

Great news — ${opts.orgName} has been approved for the PeptSci partner program. Your existing PeptSci login now has partner access, so there's nothing to set up — just sign in.

Once you're in, here's what you can do:
${PARTNER_PORTAL_BULLETS_TEXT}

Sign in to your partner portal: ${APP_URL}/partners

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
    return { subject, html, text }
  }

  if (opts.inviteUrl) {
    const html = layout({
      heading: 'Welcome to the partner program! 🎉',
      body:
        para(greetingHtml(opts.contactName)) +
        para(
          `Great news — <strong>${escapeHtml(opts.orgName)}</strong> has been approved for the PeptSci partner program. You&rsquo;re one click away from your partner portal.`
        ) +
        para('Once you&rsquo;re in, here&rsquo;s what you can do:') +
        bulletList(PARTNER_PORTAL_BULLETS) +
        para(
          `Use the button below to accept your invitation and create your login. The link is valid for 30 days.`
        ),
      cta: { label: 'Accept invitation & set up your portal', href: opts.inviteUrl },
    })
    const text = `${greeting(opts.contactName)}

Great news — ${opts.orgName} has been approved for the PeptSci partner program. You're one click away from your partner portal.

Once you're in, here's what you can do:
${PARTNER_PORTAL_BULLETS_TEXT}

Accept your invitation and create your login (the link is valid for 30 days):
${opts.inviteUrl}

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
    return { subject, html, text }
  }

  const html = layout({
    heading: 'Welcome to the partner program! 🎉',
    body:
      para(greetingHtml(opts.contactName)) +
      para(
        `Great news — <strong>${escapeHtml(opts.orgName)}</strong> has been approved for the PeptSci partner program.`
      ) +
      para(
        'You&rsquo;ll receive a separate sign-up invitation email in the next few minutes. Accept it to create your login, then sign in to your partner portal to create referral links, invite reps, and track your commissions.'
      ),
    cta: { label: 'Partner portal', href: `${APP_URL}/partners` },
  })
  const text = `${greeting(opts.contactName)}

Great news — ${opts.orgName} has been approved for the PeptSci partner program.

You'll receive a separate sign-up invitation email in the next few minutes. Accept it to create your login, then sign in to your partner portal to create referral links, invite reps, and track your commissions.

Partner portal: ${APP_URL}/partners

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

/** Branded sign-up invitation for a sales rep joining a partner org. */
export function partnerRepInviteEmail(opts: {
  repName?: string | null
  orgName: string
  inviteUrl: string
}): EmailContent {
  const subject = `You're invited to join ${opts.orgName} on PeptSci`
  const html = layout({
    heading: `Join ${escapeHtml(opts.orgName)} on PeptSci`,
    body:
      para(greetingHtml(opts.repName)) +
      para(
        `<strong>${escapeHtml(opts.orgName)}</strong> has invited you to join their team as a sales rep on the PeptSci partner platform.`
      ) +
      para('With your rep login you can:') +
      bulletList([
        `<strong>Create your own referral links</strong> — clinics that sign up through them are attributed to you.`,
        `<strong>Register leads</strong> — lock in attribution for clinics you&rsquo;re actively working.`,
        `<strong>Track your commissions</strong> — watch earnings accrue automatically as your clinics order.`,
      ]) +
      para('Use the button below to accept your invitation and create your login. The link is valid for 30 days.'),
    cta: { label: 'Accept invitation', href: opts.inviteUrl },
  })
  const text = `${greeting(opts.repName)}

${opts.orgName} has invited you to join their team as a sales rep on the PeptSci partner platform.

With your rep login you can:
- Create your own referral links — clinics that sign up through them are attributed to you.
- Register leads — lock in attribution for clinics you're actively working.
- Track your commissions — watch earnings accrue automatically as your clinics order.

Accept your invitation and create your login (the link is valid for 30 days):
${opts.inviteUrl}

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

/** Branded sign-up invitation for an org teammate (ADMIN/VIEWER). */
export function partnerTeamInviteEmail(opts: {
  name?: string | null
  orgName: string
  role: 'ADMIN' | 'VIEWER'
  inviteUrl: string
}): EmailContent {
  const subject = `You're invited to join ${opts.orgName} on PeptSci`
  const roleLine =
    opts.role === 'ADMIN'
      ? 'As an <strong>admin</strong>, you can manage reps and teammates, create referral links, and see the full commission picture for the org.'
      : 'As a <strong>viewer</strong>, you can view the org&rsquo;s clinics, referral performance, and commission reports.'
  const roleLineText =
    opts.role === 'ADMIN'
      ? 'As an admin, you can manage reps and teammates, create referral links, and see the full commission picture for the org.'
      : "As a viewer, you can view the org's clinics, referral performance, and commission reports."
  const html = layout({
    heading: `Join ${escapeHtml(opts.orgName)} on PeptSci`,
    body:
      para(greetingHtml(opts.name)) +
      para(
        `<strong>${escapeHtml(opts.orgName)}</strong> has invited you to their PeptSci partner portal.`
      ) +
      para(roleLine) +
      para('Use the button below to accept your invitation and create your login. The link is valid for 30 days.'),
    cta: { label: 'Accept invitation', href: opts.inviteUrl },
  })
  const text = `${greeting(opts.name)}

${opts.orgName} has invited you to their PeptSci partner portal.

${roleLineText}

Accept your invitation and create your login (the link is valid for 30 days):
${opts.inviteUrl}

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerClinicAttributedEmail(opts: {
  contactName?: string | null
  clinicName: string
  via: 'link' | 'lead'
}): EmailContent {
  const subject = `New clinic attributed to you — ${opts.clinicName}`
  const viaLabel = opts.via === 'lead' ? 'matched to your registered lead' : 'signed up through your referral link'
  const html = layout({
    heading: 'You just landed a clinic! 🎉',
    body:
      para(greetingHtml(opts.contactName)) +
      para(
        `<strong>${escapeHtml(opts.clinicName)}</strong> ${viaLabel} and is now attributed to you. Once their account is approved and they start ordering, your commission accrues automatically on every purchase.`
      ) +
      para('Track them live in your partner portal.'),
    cta: { label: 'Open your portal', href: `${APP_URL}/partners/clinics` },
  })
  const text = `${greeting(opts.contactName)}

${opts.clinicName} ${viaLabel} and is now attributed to you. Once their account is approved and they start ordering, your commission accrues automatically on every purchase.

Portal: ${APP_URL}/partners/clinics

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerPayoutRecordedEmail(opts: {
  contactName?: string | null
  amount: string
  method?: string | null
  reference?: string | null
}): EmailContent {
  const subject = `Payout sent — ${opts.amount}`
  const html = layout({
    heading: 'Your payout is on the way',
    body:
      para(greetingHtml(opts.contactName)) +
      para(`We\u2019ve recorded a commission payout of <strong>${escapeHtml(opts.amount)}</strong>.`) +
      detailPanel([
        ['Amount', opts.amount],
        ['Method', opts.method || '—'],
        ['Reference', opts.reference || '—'],
      ]) +
      para('The full ledger is in your portal under Payouts.'),
    cta: { label: 'View payouts', href: `${APP_URL}/partners/payouts` },
  })
  const text = `${greeting(opts.contactName)}

We've recorded a commission payout of ${opts.amount}.
Method: ${opts.method || '—'}  Reference: ${opts.reference || '—'}

Payouts: ${APP_URL}/partners/payouts

Questions? ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function partnerDailyDigestEmail(opts: {
  contactName?: string | null
  dateLabel: string
  earned: string
  transactionCount: number
  unpaid: string
}): EmailContent {
  const subject = `You earned ${opts.earned} yesterday — PeptSci partner digest`
  const html = layout({
    heading: 'Your daily commission digest',
    body:
      para(greetingHtml(opts.contactName)) +
      para(
        `On <strong>${escapeHtml(opts.dateLabel)}</strong> your attributed clinics generated <strong>${opts.transactionCount}</strong> transaction${opts.transactionCount === 1 ? '' : 's'}, earning you <strong>${escapeHtml(opts.earned)}</strong> in commission.`
      ) +
      detailPanel([
        ['Earned', opts.earned],
        ['Transactions', String(opts.transactionCount)],
        ['Unpaid balance', opts.unpaid],
      ]),
    cta: { label: 'See the details', href: `${APP_URL}/partners/transactions` },
  })
  const text = `${greeting(opts.contactName)}

On ${opts.dateLabel} your attributed clinics generated ${opts.transactionCount} transaction(s), earning you ${opts.earned} in commission. Unpaid balance: ${opts.unpaid}.

Details: ${APP_URL}/partners/transactions

© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}

export function affiliateRejectedEmail(opts: {
  contactName?: string | null
  orgName: string
  reason?: string
}): EmailContent {
  const subject = 'Update on your PeptSci partner application'
  const reasonBlock = opts.reason ? para(`<strong>Reason:</strong> ${escapeHtml(opts.reason)}`) : ''
  const html = layout({
    heading: 'About your application',
    body:
      para(greetingHtml(opts.contactName)) +
      para(
        `Thanks for your interest in the PeptSci partner program. After review, we&rsquo;re unable to approve the application for <strong>${escapeHtml(opts.orgName)}</strong> at this time.`
      ) +
      reasonBlock +
      para(`If you believe this is an error or your situation changes, reply to this email or contact ${SUPPORT_EMAIL}.`),
  })
  const text = `${greeting(opts.contactName)}

Thanks for your interest in the PeptSci partner program. After review, we're unable to approve the application for ${opts.orgName} at this time.
${opts.reason ? `\nReason: ${opts.reason}\n` : ''}
If you believe this is an error or your situation changes, contact ${SUPPORT_EMAIL}.

© ${new Date().getFullYear()} PeptSci`
  return { subject, html, text }
}
