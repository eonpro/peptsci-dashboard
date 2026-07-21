import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'PeptSci Partner Program'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/** Share card for the public partner-program application page. */
export default function Image() {
  return renderOgCard({
    eyebrow: 'Partner program',
    title: 'Refer clinics. Earn on every attributed sale.',
    subtitle:
      'Join the PeptSci partner program: share your link, track your numbers in a dedicated portal, and get paid on every order you drive.',
    badges: ['90-day attribution', 'Real-time tracking', 'Monthly payouts'],
  })
}
