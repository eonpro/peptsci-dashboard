import Link from 'next/link'
import type { Metadata } from 'next'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, FlaskConical, Truck, BadgeDollarSign } from 'lucide-react'

export const metadata: Metadata = {
  title: 'You\u2019re invited | PeptSci',
  description: 'Create your PeptSci practice account to order research peptides.',
}

/**
 * Branded landing for partner referral links (/join/<code> sets the
 * attribution cookie, then redirects here). Public.
 */
export default function JoinWelcomePage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-brand-bg via-white to-brand-bg/50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-white/70 bg-white/95 p-8 shadow-2xl backdrop-blur-sm md:p-10">
          <div className="mb-6 flex justify-center">
            <Logo width={150} height={50} />
          </div>

          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> Partner invitation applied
            </span>
            <h1 className="mt-4 text-3xl font-bold text-gray-900">
              Welcome to PeptSci
            </h1>
            <p className="mx-auto mt-2 max-w-md text-gray-600">
              You&apos;ve been referred by one of our partners. Create your practice account to
              browse the catalog, see your pricing, and place your first order.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: FlaskConical, label: 'Research-grade peptides' },
              { icon: Truck, label: 'Fast 2-day shipping' },
              { icon: BadgeDollarSign, label: 'Practice pricing' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700"
              >
                <Icon className="h-4 w-4 shrink-0 text-brand-primary" />
                {label}
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            <Button asChild className="h-12 w-full rounded-xl text-base font-semibold">
              <Link href="/sign-up">
                Create your account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/sign-in" className="font-medium text-brand-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your referral is saved for 90 days — finish signing up any time and your partner still
          gets credit.
        </p>
      </div>
    </div>
  )
}
