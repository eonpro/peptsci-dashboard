import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import {
  PRIVACY_POLICY_MARKDOWN,
  PRIVACY_POLICY_LAST_UPDATED,
} from '@/lib/legal/privacy-policy'

export const metadata: Metadata = {
  title: 'PeptSci - Privacy Policy',
  description: 'Privacy Policy for the PeptSci platform',
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated={PRIVACY_POLICY_LAST_UPDATED}
      markdown={PRIVACY_POLICY_MARKDOWN}
    />
  )
}
