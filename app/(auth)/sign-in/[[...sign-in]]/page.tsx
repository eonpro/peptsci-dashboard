import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { authAppearance } from '@/lib/clerk-appearance'

export default function SignInPage() {
  return (
    <div className="w-full">
      <SignIn appearance={authAppearance} signUpUrl="/sign-up" forceRedirectUrl="/" />
      <p className="mt-6 text-center text-sm text-white/55">
        Don&apos;t have an account?{' '}
        <Link
          href="/sign-up"
          className="font-medium text-[#8b95ff] transition-colors hover:text-white"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
