/**
 * Shared write-audit helper for sensitive admin mutations.
 *
 * Until now every AuditLog writer hand-rolled `prisma.auditLog.create` (ship
 * overrides, consume draws, cron send markers). This module gives the rest of
 * the admin surface a one-liner so disputes like "who changed this clinic's
 * rate?" are answerable after the fact.
 *
 * Contract: `writeAudit` NEVER throws and never blocks the mutation it
 * documents — audit failures are logged and swallowed. Call it AFTER the
 * mutation commits (or fire-and-forget with `void`).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveAdminUserId } from '@/lib/notifications/current-user'

export interface AuditInput {
  /** Clerk id of the acting admin; resolved to the internal User.id. Null = system. */
  clerkUserId?: string | null
  /** Model/domain name, e.g. 'Client', 'PartnerOrg', 'ClientPricing'. */
  entity: string
  entityId: string
  /** snake_case verb, e.g. 'pricing_set', 'role_changed', 'credit_adjusted'. */
  action: string
  orderId?: string | null
  metadata?: Record<string, unknown> | null
}

export async function writeAudit(input: AuditInput): Promise<void> {
  if (!prisma) return
  try {
    const userId = await resolveAdminUserId(input.clerkUserId ?? null)
    await prisma.auditLog.create({
      data: {
        userId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        orderId: input.orderId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    logger.warn('[AUDIT] write failed (non-blocking)', {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export type FieldChange = { from: unknown; to: unknown }

/**
 * Pure before/after diff for audit metadata. Only fields present in `after`
 * are compared (PATCH semantics: untouched fields are not "changes"). Values
 * are compared by JSON identity so Dates/Decimals normalize sanely.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {}
  for (const key of Object.keys(after)) {
    const prev = normalize(before[key])
    const next = normalize(after[key])
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[key] = { from: prev, to: next }
    }
  }
  return changes
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  // Prisma Decimal (and anything else with a meaningful toString that isn't a
  // plain object/array) — compare numerically-ish via string.
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.constructor?.name === 'Decimal'
  ) {
    return String(value)
  }
  return value
}
