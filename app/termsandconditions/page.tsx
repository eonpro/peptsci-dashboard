import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import {
  TERMS_OF_SERVICE_MARKDOWN,
  TERMS_OF_SERVICE_LAST_UPDATED,
} from '@/lib/legal/terms-of-service'

export const metadata: Metadata = {
  title: 'PeptSci - Terms of Service',
  description: 'Terms of Service for the PeptSci platform',
}

export default function TermsOfUsePage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated={TERMS_OF_SERVICE_LAST_UPDATED}
      markdown={TERMS_OF_SERVICE_MARKDOWN}
    />
  )
}
