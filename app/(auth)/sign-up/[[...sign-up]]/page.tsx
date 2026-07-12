import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'
import { authAppearance } from '@/lib/clerk-appearance'

export default function SignUpPage() {
  return (
    <div className="w-full">
      <SignUp appearance={authAppearance} signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
      <p className="mt-6 text-center text-sm text-white/55">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-[#8b95ff] transition-colors hover:text-white"
        >
          Sign in
        </Link>
      </p>
      <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-white/35">
        New accounts require approval before platform access. Approval typically takes 24–48 hours.
      </p>

      {/* SMS program disclosure (TCPA / Twilio A2P). Consent itself is collected
          via the un-prechecked checkbox on the onboarding form. */}
      <div className="mx-auto mt-6 max-w-sm rounded-xl border border-white/10 bg-white/5 p-4 text-left">
        <p className="text-xs leading-relaxed text-white/45">
          <span className="font-medium text-white/60">SMS notifications:</span> During account
          setup you may opt in to receive automated text messages from PeptSci about order
          updates, shipping and delivery notifications, and important account alerts. Message
          frequency varies based on your order activity. Message and data rates may apply.
          Reply HELP for help or STOP to cancel at any time. Consent is not required to make a
          purchase.
        </p>
        <p className="mt-2 text-xs text-white/45">
          <Link
            href="/termsandconditions"
            className="text-[#8b95ff] underline transition-colors hover:text-white"
          >
            Terms of Service
          </Link>{' '}
          |{' '}
          <Link
            href="/privacy"
            className="text-[#8b95ff] underline transition-colors hover:text-white"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  )
}
