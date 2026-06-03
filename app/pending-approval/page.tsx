import { PendingApprovalContent } from './PendingApprovalContent'

// Force dynamic rendering - this page requires auth context
export const dynamic = 'force-dynamic'

export default function PendingApprovalPage() {
  return <PendingApprovalContent />
}
