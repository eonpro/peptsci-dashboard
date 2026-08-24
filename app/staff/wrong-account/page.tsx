import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { isStaffRole } from '@/lib/access'
import { staffNoAccessKind } from '@/lib/staff/access'
import { StaffNoAccess } from '@/components/staff/StaffNoAccess'

export const dynamic = 'force-dynamic'

export default async function StaffWrongAccountPage() {
  const { userId, sessionClaims } = await auth()
  if (!userId) redirect('/staff/sign-in')
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
  if (isStaffRole(role)) redirect('/dashboard')
  return <StaffNoAccess kind={staffNoAccessKind(role)} />
}
