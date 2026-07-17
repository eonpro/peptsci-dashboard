/**
 * Partner API key auth for the read-only /api/partner/v1 surface.
 *
 * Keys look like `pk_live_<24 hex>` + secret; only the SHA-256 hash is stored
 * (the plaintext is shown once at creation). Requests authenticate with
 * `Authorization: Bearer <key>`.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { PartnerOrg } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface GeneratedApiKey {
  /** Full plaintext key — show once, never store. */
  key: string
  keyPrefix: string
  keyHash: string
}

export function generatePartnerApiKey(): GeneratedApiKey {
  const prefix = `pk_live_${randomBytes(6).toString('hex')}`
  const secret = randomBytes(24).toString('hex')
  const key = `${prefix}.${secret}`
  return { key, keyPrefix: prefix, keyHash: hashApiKey(key) }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Resolve a Bearer API key to its ACTIVE partner org, or null. Touches
 * lastUsedAt (best-effort, never blocks the request).
 */
export async function authenticatePartnerApiKey(
  authorization: string | null
): Promise<{ org: PartnerOrg; keyId: string } | null> {
  if (!prisma || !authorization?.startsWith('Bearer ')) return null
  const key = authorization.slice('Bearer '.length).trim()
  const prefix = key.split('.')[0]
  if (!prefix?.startsWith('pk_live_')) return null

  const candidates = await prisma.partnerApiKey.findMany({
    where: { keyPrefix: prefix, revokedAt: null },
    include: { org: true },
  })
  const hash = hashApiKey(key)
  for (const candidate of candidates) {
    if (!safeEqualHex(candidate.keyHash, hash)) continue
    if (candidate.org.status !== 'ACTIVE') return null
    prisma.partnerApiKey
      .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
    return { org: candidate.org, keyId: candidate.id }
  }
  return null
}
