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

/** A boxed key/value detail panel (order #, tracking #, carrier). */
function detailPanel(rows: Array<[string, string]>): string {
  const inner = rows
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 0;color:${BRAND.muted};font-size:13px;white-space:nowrap;">${k}</td>
           <td style="padding:6px 0 6px 16px;color:${BRAND.text};font-size:14px;font-weight:600;text-align:right;">${v}</td>
         </tr>`
    )
    .join('')
  return `<tr><td style="padding:4px 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:12px;padding:8px 18px;">
      ${inner}
    </table>
  </td></tr>`
}

const greeting = (name?: string | null) => (name && name.trim() ? `Hi ${name.trim()},` : 'Hello,')

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
      para(greeting(opts.firstName)) +
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
      para(greeting(opts.name)) +
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
    ? para(`<strong>Reason:</strong> ${opts.reason}`)
    : ''
  const html = layout({
    heading: 'Update on your application',
    body:
      para(greeting(opts.name)) +
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
    ? para(`<strong>What we need:</strong> ${opts.message}`)
    : para('Please sign in to review what&rsquo;s needed and update your details.')
  const html = layout({
    heading: 'We need a bit more information',
    body:
      para(greeting(opts.name)) +
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
      para(greeting(opts.customerName)) +
      para(`Good news — your PeptSci order ${ord} has shipped via ${carrier}.`) +
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
      para(greeting(opts.customerName)) +
      para(`Your PeptSci order ${ord} was delivered by ${carrier}.`) +
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

export function orderExceptionEmail(opts: ShipmentEmailOpts): EmailContent {
  const carrier = opts.carrier?.trim() || 'FedEx'
  const ord = orderLabel(opts.orderNumber)
  const subject = `Update on your PeptSci order ${ord}`
  const html = layout({
    heading: 'There&rsquo;s a delay with your shipment',
    body:
      para(greeting(opts.customerName)) +
      para(`${carrier} reported a delivery exception for your PeptSci order ${ord}. This can happen due to weather, an address issue, or a missed delivery attempt.`) +
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
