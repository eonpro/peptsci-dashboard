/**
 * Pure rules for deciding which clinic an inbound phone number belongs to.
 *
 * Candidate sources, strongest first:
 *   SUBSCRIBER     — the number opted in on /sms while signed in as this clinic
 *   PRIOR_TEXT     — we already texted this number for this clinic (tracking, invoices)
 *   CONTACT_PHONE  — Client.contactPhone matches
 *   SHIPPING_PHONE — a clinic / order shipping address carries this phone
 *
 * The picker only auto-links when the strongest tier that has any evidence
 * names exactly one clinic. Anything else is surfaced to staff as
 * "possible matches" rather than guessed.
 */

export type MatchSource = 'SUBSCRIBER' | 'PRIOR_TEXT' | 'CONTACT_PHONE' | 'SHIPPING_PHONE'

export interface ClientCandidate {
  clientId: string
  source: MatchSource
}

export const MATCH_SOURCE_PRIORITY: readonly MatchSource[] = [
  'SUBSCRIBER',
  'PRIOR_TEXT',
  'CONTACT_PHONE',
  'SHIPPING_PHONE',
]

export const MATCH_SOURCE_LABEL: Record<MatchSource, string> = {
  SUBSCRIBER: 'Opted in as this clinic',
  PRIOR_TEXT: 'We texted this number for this clinic',
  CONTACT_PHONE: 'Clinic contact phone',
  SHIPPING_PHONE: 'Phone on a shipping address',
}

const rank = (s: MatchSource) => MATCH_SOURCE_PRIORITY.indexOf(s)

/** One entry per clinic (strongest source kept), ordered strongest → weakest. */
export function rankCandidates(candidates: ClientCandidate[]): ClientCandidate[] {
  const best = new Map<string, MatchSource>()
  for (const c of candidates) {
    const cur = best.get(c.clientId)
    if (cur === undefined || rank(c.source) < rank(cur)) best.set(c.clientId, c.source)
  }
  return [...best.entries()]
    .map(([clientId, source]) => ({ clientId, source }))
    .sort((a, b) => rank(a.source) - rank(b.source))
}

/**
 * Auto-link decision: the clinic named by the strongest tier, or null when that
 * tier is ambiguous (two clinics) or there is no evidence at all.
 */
export function pickClientFromCandidates(candidates: ClientCandidate[]): string | null {
  const ranked = rankCandidates(candidates)
  if (ranked.length === 0) return null
  const topSource = ranked[0].source
  const atTop = ranked.filter((c) => c.source === topSource)
  return atTop.length === 1 ? atTop[0].clientId : null
}
