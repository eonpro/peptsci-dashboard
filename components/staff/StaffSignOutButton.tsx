'use client'

import { LogOut } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { isClerkConfigured } from '@/lib/clerk-config'
import { STAFF_SIGN_IN_PATH } from '@/lib/staff/access'

export function StaffSignOutButton({
  variant = 'outline',
  className,
  redirectUrl = STAFF_SIGN_IN_PATH,
  label = 'Sign out',
}: {
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  redirectUrl?: string
  label?: string
}) {
  if (!isClerkConfigured) return null
  return (
    <StaffSignOutButtonInner
      variant={variant}
      className={className}
      redirectUrl={redirectUrl}
      label={label}
    />
  )
}

function StaffSignOutButtonInner({
  variant,
  className,
  redirectUrl,
  label,
}: {
  variant: 'default' | 'outline' | 'ghost'
  className?: string
  redirectUrl: string
  label: string
}) {
  const { signOut } = useClerk()
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => signOut({ redirectUrl })}
    >
      <LogOut className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}
