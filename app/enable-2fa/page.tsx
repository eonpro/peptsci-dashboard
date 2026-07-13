'use client'

import Link from 'next/link'
import { UserProfile } from '@clerk/nextjs'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Shown to admins when ADMIN_REQUIRE_2FA=true and their Clerk account has no
 * second factor. They enroll TOTP/SMS below (Clerk UserProfile → Security),
 * then continue back into the console.
 */
export default function Enable2faPage() {
  return (
    <div className="min-h-screen bg-brand-onyx px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">
                Two-factor authentication required
              </h1>
              <p className="mt-1 text-sm text-white/70">
                Admin accounts must have a second factor enabled before using the admin console.
                Open <span className="font-medium text-white">Security</span> below and add an
                authenticator app (TOTP), then continue.
              </p>
              <Button asChild size="sm" className="mt-3 bg-brand-primary text-white hover:bg-[#1a30c0]">
                <Link href="/dashboard">I&apos;ve enabled it — continue to dashboard</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <UserProfile routing="hash" />
        </div>
      </div>
    </div>
  )
}
