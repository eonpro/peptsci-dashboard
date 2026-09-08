/**
 * PeptSci Alerts enrollment. Records TCPA proof-of-consent for a mobile number
 * (verbatim consent text, timestamp, source, request metadata), links it to a
 * signed-in client when there is one, and sends the one-time opt-in
 * confirmation the campaign registration promises.
 *
 * @module lib/sms/subscribe
 */

import { prisma } from '../prisma'
import { logger } from '../logger'
import { sendSms } from './client'
import {
  SMS_CONSENT_CHECKBOX_TEXT,
  SMS_OPT_IN_CONFIRMATION,
  type SmsConsentSource,
  type SmsSubscribeInput,
} from './program'

export interface EnrollSmsSubscriberParams extends SmsSubscribeInput {
  source: SmsConsentSource
  /** Client account of the signed-in user, when the form was submitted while logged in. */
  clientId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface EnrollSmsSubscriberResult {
  id: string
  phone: string
  /** False when the same number was already active (re-consent refreshed the record). */
  created: boolean
  /** Whether the confirmation SMS was handed to Twilio (false when SMS is disabled/failed). */
  confirmationSent: boolean
}

/**
 * Upsert the consent record for `phone`. Re-enrolling an opted-out or existing
 * number re-arms it with a fresh consent timestamp (the latest consent is what
 * matters for TCPA). Never throws for the confirmation text — enrollment must
 * succeed even when Twilio is unavailable.
 */
export async function enrollSmsSubscriber(
  params: EnrollSmsSubscriberParams
): Promise<EnrollSmsSubscriberResult> {
  if (!prisma) throw new Error('Database is not configured')
  const now = new Date()

  const existing = await prisma.smsSubscriber.findUnique({
    where: { phone: params.phone },
    select: { id: true, optedOutAt: true },
  })

  const row = await prisma.smsSubscriber.upsert({
    where: { phone: params.phone },
    create: {
      phone: params.phone,
      email: params.email,
      clientId: params.clientId ?? null,
      consentText: SMS_CONSENT_CHECKBOX_TEXT,
      consentedAt: now,
      source: params.source,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
    },
    update: {
      email: params.email ?? undefined,
      clientId: params.clientId ?? undefined,
      consentText: SMS_CONSENT_CHECKBOX_TEXT,
      consentedAt: now,
      optedOutAt: null,
      source: params.source,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
    },
    select: { id: true, phone: true },
  })

  // Keep the account-level flag in sync so transactional sends (shipped /
  // delivered / overdue) are unlocked for the practice that just enrolled.
  if (params.clientId) {
    await prisma.client
      .update({
        where: { id: params.clientId },
        data: { smsOptIn: true, smsOptInAt: now },
      })
      .catch((e) =>
        logger.warn('[SMS SUBSCRIBE] client flag sync failed (non-blocking)', {
          clientId: params.clientId,
          error: e instanceof Error ? e.message : String(e),
        })
      )
  }

  // One-time opt-in confirmation (only when newly enrolled or re-enrolled after
  // a STOP, so repeat submissions do not spam the subscriber).
  let confirmationSent = false
  if (!existing || existing.optedOutAt) {
    const res = await sendSms({ to: row.phone, body: SMS_OPT_IN_CONFIRMATION })
    confirmationSent = res.ok && !res.skipped
  }

  logger.info('[SMS SUBSCRIBE] consent recorded', {
    id: row.id,
    source: params.source,
    created: !existing,
    clientId: params.clientId ?? null,
    confirmationSent,
  })

  return { id: row.id, phone: row.phone, created: !existing, confirmationSent }
}

/** Mark a number as opted out (STOP keyword webhook or account toggle). */
export async function markSmsSubscriberOptedOut(phone: string): Promise<boolean> {
  if (!prisma) throw new Error('Database is not configured')
  const res = await prisma.smsSubscriber.updateMany({
    where: { phone, optedOutAt: null },
    data: { optedOutAt: new Date() },
  })
  return res.count > 0
}
