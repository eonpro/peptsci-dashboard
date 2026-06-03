import { AdminHeader } from '@/components/AdminHeader'
import { AdminFooter } from '@/components/AdminFooter'

// Force dynamic rendering - dashboard requires auth context
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark flex min-h-screen flex-col bg-[#050722]">
      <AdminHeader />
      <main className="flex-1 bg-gradient-to-br from-[#050722] via-[#050722] to-[#0a0e3a]">
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <AdminFooter />
    </div>
  )
}
