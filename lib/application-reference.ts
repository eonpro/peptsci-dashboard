/**
 * Human-friendly application reference numbers, e.g. "PRT-20260719-8K4Q".
 *
 * Shown on the /thank-you confirmation page, in admin notifications, and in
 * applicant emails so support conversations can anchor on one number.
 * Derived deterministically from the record's id + creation date (no extra
 * column or migration): DATE narrows the window, and the id suffix is unique
 * within it. Prefixes: PRT = partner application, CLN = clinic application.
 */

export type ApplicationKind = 'partner' | 'clinic'

const PREFIX: Record<ApplicationKind, string> = {
  partner: 'PRT',
  clinic: 'CLN',
}

export function applicationReference(kind: ApplicationKind, id: string, createdAt: Date): string {
  const y = createdAt.getUTCFullYear()
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(createdAt.getUTCDate()).padStart(2, '0')
  const suffix = id
    .replace(/[^a-z0-9]/gi, '')
    .slice(-4)
    .toUpperCase()
    .padStart(4, '0')
  return `${PREFIX[kind]}-${y}${m}${d}-${suffix}`
}
