import { redirect } from 'next/navigation'

/**
 * Partner API access is disabled — the program doesn't offer API keys or
 * webhooks to partners. The page (and its nav entry) were removed; anyone
 * hitting the old URL lands back on the dashboard.
 */
export default function PartnerApiPage() {
  redirect('/partners')
}
