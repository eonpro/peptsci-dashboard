import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import {
  SHIPPING_POLICY_MARKDOWN,
  SHIPPING_POLICY_LAST_UPDATED,
} from '@/lib/legal/shipping-policy'

export const metadata: Metadata = {
  title: 'PeptSci - Shipping and Distribution Policy',
  description: 'Shipping and Distribution Policy for the PeptSci platform',
}

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping and Distribution Policy"
      lastUpdated={SHIPPING_POLICY_LAST_UPDATED}
      markdown={SHIPPING_POLICY_MARKDOWN}
    />
  )
}
