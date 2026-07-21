import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'Track your PeptSci shipment'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/**
 * Share card for shipment-tracking links (/tracking and
 * /tracking/<number> — sent to clients by email/SMS, often forwarded).
 */
export default function Image() {
  return renderOgCard({
    eyebrow: 'Order update',
    title: 'Track your PeptSci shipment',
    subtitle: 'Live carrier status for your order, updated as it moves.',
    badges: ['Cold-chain handled', 'Fast fulfillment', 'peptsci.com/tracking'],
  })
}
