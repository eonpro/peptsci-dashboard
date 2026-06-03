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
    </div>
  )
}
