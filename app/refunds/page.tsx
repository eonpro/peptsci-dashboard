import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { REFUND_POLICY_MARKDOWN, REFUND_POLICY_LAST_UPDATED } from '@/lib/legal/refund-policy'

export const metadata: Metadata = {
  title: 'PeptSci - Refund and Order Resolution Policy',
  description: 'Refund and Order Resolution Policy for the PeptSci platform',
}

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund and Order Resolution Policy"
      lastUpdated={REFUND_POLICY_LAST_UPDATED}
      markdown={REFUND_POLICY_MARKDOWN}
    />
  )
}
