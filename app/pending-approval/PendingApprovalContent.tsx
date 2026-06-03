'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Logo } from '@/components/Logo'
import { Clock, Mail, Phone, CheckCircle2, AlertCircle, LogOut } from 'lucide-react'

export function PendingApprovalContent() {
  const { signOut } = useClerk()
  const { user } = useUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg via-white to-brand-bg/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl border-0 bg-white/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <Logo width={140} height={48} />
          </div>
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Account Pending Approval
          </CardTitle>
          <CardDescription className="text-base text-gray-600 mt-2">
            Welcome, {user?.firstName || 'there'}! Your account is currently under review.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Status Steps */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-gray-700">Account created successfully</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <span className="text-gray-700 font-medium">Awaiting admin approval</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-4 w-4 text-gray-400" />
              </div>
              <span className="text-gray-400">Access to platform</span>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Our team will review your account within 24-48 hours</li>
              <li>• You&apos;ll receive an email once approved</li>
              <li>• After approval, you can browse products and place orders</li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Need to expedite approval?</h4>
            <div className="space-y-2">
              <a
                href="mailto:support@peptsci.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-primary transition-colors"
              >
                <Mail className="h-4 w-4" />
                support@peptsci.com
              </a>
              <a
                href="tel:+18005551234"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-primary transition-colors"
              >
                <Phone className="h-4 w-4" />
                1-800-555-1234
              </a>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
            Check Status
          </Button>
          <Button
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-700"
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
