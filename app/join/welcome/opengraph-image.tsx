import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og/card'

export const alt = 'You\u2019re invited to PeptSci'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

/**
 * Share card for partner referral links: /join/<code> 307s here, and link
 * scrapers follow the redirect, so this is the preview a prospect sees when
 * a partner texts or emails their link.
 */
export default function Image() {
  return renderOgCard({
    eyebrow: 'You\u2019re invited',
    title: 'Your practice is invited to PeptSci',
    subtitle:
      'Create your account to order COA-verified research peptides with transparent practice pricing.',
  })
}
