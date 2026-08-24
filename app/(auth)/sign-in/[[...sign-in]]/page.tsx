import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { authAppearance } from '@/lib/clerk-appearance'
import {
  isPartnerSignInIntent,
  PARTNER_APPLY_PATH,
  partnerPostAuthPath,
} from '@/lib/partners/access'
import { isStaffSignInIntent, staffPostAuthPath } from '@/lib/staff/access'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; redirect_url?: string }>
}) {
  const q = await searchParams
  const staff = isStaffSignInIntent({
    intent: q.intent,
    redirectUrl: q.redirect_url,
  })
  const partner = !staff && isPartnerSignInIntent({
    intent: q.intent,
    redirectUrl: q.redirect_url,
  })
  const afterAuth = staff
    ? staffPostAuthPath({ intent: q.intent, redirectUrl: q.redirect_url })
    : partnerPostAuthPath({
        intent: q.intent,
        redirectUrl: q.redirect_url,
      })

  return (
    <div className="w-full">
      {staff ? (
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
            Staff console
          </p>
          <p className="mt-2 text-sm text-white/60">
            For PeptSci operations — not clinic ordering or partner commissions.
          </p>
        </div>
      ) : partner ? (
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
            Partner portal
          </p>
          <p className="mt-2 text-sm text-white/60">
            For sales organizations and reps — not clinic ordering.
          </p>
        </div>
      ) : null}
      <SignIn
        appearance={authAppearance}
        signUpUrl={partner ? PARTNER_APPLY_PATH : staff ? undefined : '/sign-up'}
        forceRedirectUrl={afterAuth}
      />
      <p className="mt-6 text-center text-sm text-white/55">
        {staff ? (
          <>Staff accounts are invited. If you need access, ask your admin.</>
        ) : partner ? (
          <>
            New to the partner program?{' '}
            <Link
              href={PARTNER_APPLY_PATH}
              className="font-medium text-[#8b95ff] transition-colors hover:text-white"
            >
              Apply here
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <Link
              href="/sign-up"
              className="font-medium text-[#8b95ff] transition-colors hover:text-white"
            >
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
