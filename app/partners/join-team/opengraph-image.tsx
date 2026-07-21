import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'Join a PeptSci sales team'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/** Share card for org join-team links (/partners/join-team/<code>). */
export default function Image() {
  return renderOgCard({
    eyebrow: 'Team invitation',
    title: 'You\u2019re invited to join a PeptSci sales team',
    subtitle:
      'Apply to join the team, get your own referral links, and earn commission on every clinic you bring on.',
    badges: ['90-day attribution', 'Real-time tracking', 'Monthly payouts'],
  })
}
