/**
 * Inbound keyword handling for PeptSci Alerts (STOP / START / HELP).
 *
 * Twilio's Advanced Opt-Out (enabled on the Messaging Service) already sends
 * the carrier-level auto-replies and blocks further sends to a STOP'd number.
 * This module keeps OUR records in step so the app never even attempts a
 * send (SmsSubscriber.optedOutAt, Client.smsOptIn) and so re-consent via
 * START is captured as proof (source = KEYWORD, consentText = the keyword).
 *
 * @module lib/sms/inbound
 */

import { prisma } from '../prisma'
import { logger } from '../logger'
import { toE164US } from './phone'
import type { InboundKeyword } from './twilio-webhook'
import { findClientIdsByPhone } from './inbox-core'

export interface HandleInboundKeywordResult {
  keyword: InboundKeyword
  phone: string
  /** SmsSubscriber rows touched (0 or 1). */
  subscribersUpdated: number
  /** Client rows whose smsOptIn flag was flipped. */
  clientsUpdated: number
}

/**
 * Apply a keyword from `from`. Idempotent; safe to call for every inbound
 * message (non-keywords should be filtered out by the caller).
 */
export async function handleInboundKeyword(
  from: string,
  keyword: InboundKeyword,
  rawBody: string
): Promise<HandleInboundKeywordResult | null> {
  if (!prisma) throw new Error('Database is not configured')
  const phone = toE164US(from)
  if (!phone) return null
  const now = new Date()

  if (keyword === 'HELP') {
    logger.info('[SMS INBOUND] HELP received', { phone })
    return { keyword, phone, subscribersUpdated: 0, clientsUpdated: 0 }
  }

  const subscriber = await prisma.smsSubscriber.findUnique({
    where: { phone },
    select: { id: true, clientId: true, optedOutAt: true },
  })
  const linkedClientIds = new Set<string>(await findClientIdsByPhone(phone))
  if (subscriber?.clientId) linkedClientIds.add(subscriber.clientId)
  const clientIds = [...linkedClientIds]

  if (keyword === 'STOP') {
    const [sub, clients] = await Promise.all([
      prisma.smsSubscriber.updateMany({
        where: { phone, optedOutAt: null },
        data: { optedOutAt: now },
      }),
      clientIds.length
        ? prisma.client.updateMany({
            where: { id: { in: clientIds }, smsOptIn: true },
            data: { smsOptIn: false },
          })
        : Promise.resolve({ count: 0 }),
    ])
    // A STOP from a number we have never seen still deserves a suppression
    // record so a later admin-entered contactPhone cannot be texted.
    let subscribersUpdated = sub.count
    if (!subscriber) {
      await prisma.smsSubscriber.create({
        data: {
          phone,
          consentText: rawBody.trim().slice(0, 160) || 'STOP',
          consentedAt: now,
          optedOutAt: now,
          source: 'KEYWORD',
          clientId: clientIds[0] ?? null,
        },
      })
      subscribersUpdated = 1
    }
    logger.info('[SMS INBOUND] STOP applied', { phone, subscribersUpdated, clientsUpdated: clients.count })
    return { keyword, phone, subscribersUpdated, clientsUpdated: clients.count }
  }

  // START / UNSTOP / YES — re-consent by keyword. Twilio sends its own
  // confirmation reply, so no SMS is sent from here.
  const consentText = rawBody.trim().slice(0, 160) || 'START'
  const [, clients] = await Promise.all([
    prisma.smsSubscriber.upsert({
      where: { phone },
      create: {
        phone,
        consentText,
        consentedAt: now,
        source: 'KEYWORD',
        clientId: clientIds[0] ?? null,
      },
      update: {
        consentText,
        consentedAt: now,
        optedOutAt: null,
        source: 'KEYWORD',
        clientId: subscriber?.clientId ?? clientIds[0] ?? undefined,
      },
      select: { id: true },
    }),
    clientIds.length
      ? prisma.client.updateMany({
          where: { id: { in: clientIds } },
          data: { smsOptIn: true, smsOptInAt: now },
        })
      : Promise.resolve({ count: 0 }),
  ])
  logger.info('[SMS INBOUND] START applied', { phone, clientsUpdated: clients.count })
  return { keyword, phone, subscribersUpdated: 1, clientsUpdated: clients.count }
}
