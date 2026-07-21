import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'PeptSci — high-purity research peptides for licensed practices'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/** Default share card for any page without a more specific one. */
export default function Image() {
  return renderOgCard({
    eyebrow: 'Members-only platform',
    title: 'High-purity research peptides for licensed practices',
    subtitle:
      'COA-verified, third-party-tested peptides with transparent practice pricing and fast fulfillment.',
  })
}
