import { AdminHeader } from '@/components/AdminHeader'
import { AdminFooter } from '@/components/AdminFooter'

// Force dynamic rendering - dashboard requires auth context
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-screen flex-col bg-brand-onyx">
      <AdminHeader />
      <main className="flex-1 bg-linear-to-br from-brand-onyx via-brand-onyx to-[#0a0e3a]">
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <AdminFooter />
    </div>
  )
}
