/**
 * Explain, per order, whether the automated "your order shipped" text went out —
 * and if not, why. Pure; the orders API feeds it the latest ORDER_SHIPPED
 * delivery-log row plus the gating inputs the sender checks.
 */

export type ShippedTextState = 'DELIVERED' | 'SENT' | 'FAILED' | 'SKIPPED' | 'NOT_SENT'

export interface ShippedTextStatus {
  state: ShippedTextState
  /** Short badge copy, e.g. "Text delivered". */
  label: string
  /** One-line explanation for a tooltip / secondary text. */
  detail: string
  tone: 'ok' | 'warn' | 'muted'
  /** ISO time of the attempt, when one exists. */
  at: string | null
}

export interface ShippedTextInput {
  trackingNumber: string | null
  smsOptIn: boolean
  contactPhone: string | null
  /** SMS_ENABLED + Twilio creds present on the server. */
  smsConfigured: boolean
  last: {
    status: string
    errorCode: string | null
    errorMessage: string | null
    createdAt: string
  } | null
}

/** Twilio error codes worth translating for operators. */
const TWILIO_ERROR_HINT: Record<string, string> = {
  '21610': 'Recipient replied STOP (opted out).',
  '21211': 'Invalid phone number.',
  '21614': 'Number is not SMS-capable (landline?).',
  '30003': 'Handset unreachable or switched off.',
  '30004': 'Message blocked by the carrier.',
  '30005': 'Unknown or inactive number.',
  '30006': 'Landline or unreachable carrier.',
  '30007': 'Filtered by the carrier as spam.',
  '30034': 'Sender not registered for A2P 10DLC.',
}

export function describeShippedText(input: ShippedTextInput): ShippedTextStatus | null {
  if (!input.trackingNumber) return null

  const last = input.last
  if (last) {
    const at = last.createdAt
    switch (last.status) {
      case 'DELIVERED':
        return { state: 'DELIVERED', label: 'Text delivered', detail: 'Tracking text delivered to the clinic.', tone: 'ok', at }
      case 'SENT':
      case 'QUEUED':
        return { state: 'SENT', label: 'Text sent', detail: 'Tracking text handed to the carrier; awaiting delivery receipt.', tone: 'ok', at }
      case 'SKIPPED':
        return {
          state: 'SKIPPED',
          label: 'Text skipped',
          detail: last.errorMessage || 'The app skipped this text.',
          tone: 'warn',
          at,
        }
      case 'FAILED':
      case 'UNDELIVERED':
      default: {
        const hint = last.errorCode ? TWILIO_ERROR_HINT[last.errorCode] : undefined
        const parts = [hint, last.errorMessage?.trim()].filter((p): p is string => Boolean(p))
        const detail = parts.length ? parts.join(' ') : 'Carrier did not accept the message.'
        const code = last.errorCode ? ` (Twilio ${last.errorCode})` : ''
        return { state: 'FAILED', label: 'Text failed', detail: `${detail}${code}`, tone: 'warn', at }
      }
    }
  }

  // Never attempted — say which gate blocked it, in the order the sender checks.
  if (!input.contactPhone || !input.contactPhone.trim()) {
    return { state: 'NOT_SENT', label: 'No text', detail: 'No phone on file for this clinic.', tone: 'muted', at: null }
  }
  if (!input.smsOptIn) {
    return {
      state: 'NOT_SENT',
      label: 'No text',
      detail: 'Clinic has not opted in to texts (TCPA). They can enroll at peptsci.com/sms.',
      tone: 'warn',
      at: null,
    }
  }
  if (!input.smsConfigured) {
    return { state: 'NOT_SENT', label: 'No text', detail: 'SMS sending is disabled on the server.', tone: 'muted', at: null }
  }
  return {
    state: 'NOT_SENT',
    label: 'No text',
    detail: 'No text was sent for this shipment (tracking may predate texting).',
    tone: 'muted',
    at: null,
  }
}
