'use client'

import { LogOut } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { isClerkConfigured } from '@/lib/clerk-config'
import { PARTNER_SIGN_IN_PATH } from '@/lib/partners/access'

/** Sign out for partner no-access / gate screens (Clerk only when configured). */
export function PartnerSignOutButton({
  variant = 'outline',
  className,
  redirectUrl = PARTNER_SIGN_IN_PATH,
  label = 'Sign out',
}: {
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  redirectUrl?: string
  label?: string
}) {
  if (!isClerkConfigured) return null
  return (
    <PartnerSignOutButtonInner
      variant={variant}
      className={className}
      redirectUrl={redirectUrl}
      label={label}
    />
  )
}

function PartnerSignOutButtonInner({
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
