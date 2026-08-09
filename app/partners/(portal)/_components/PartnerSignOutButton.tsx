'use client'

import { LogOut } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { isClerkConfigured } from '@/lib/clerk-config'

/** Sign out for partner no-access / gate screens (Clerk only when configured). */
export function PartnerSignOutButton({
  variant = 'outline',
  className,
}: {
  variant?: 'outline' | 'ghost'
  className?: string
}) {
  if (!isClerkConfigured) return null
  return <PartnerSignOutButtonInner variant={variant} className={className} />
}

function PartnerSignOutButtonInner({
  variant,
  className,
}: {
  variant: 'outline' | 'ghost'
  className?: string
}) {
  const { signOut } = useClerk()
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => signOut({ redirectUrl: '/sign-in' })}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Log out
    </Button>
  )
}
