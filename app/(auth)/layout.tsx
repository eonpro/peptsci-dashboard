import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Lock, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/Logo'

export const metadata: Metadata = {
  title: 'PEPTSCI - Sign In',
  description: 'Sign in to access the PEPTSCI platform',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-onyx font-sofia text-white">
      {/* Ambient gradient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12%] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-[#3b2a8c]/40 blur-[150px]" />
        <div className="absolute bottom-[-18%] left-[6%] h-[460px] w-[460px] rounded-full bg-[#213cef]/25 blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[2%] h-[420px] w-[420px] rounded-full bg-[#7a5bff]/20 blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-10">
          <Logo variant="light" width={184} height={62} />
        </div>

        {/* Auth form */}
        <div className="w-full">{children}</div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-white/40">
          <span className="flex items-center gap-1.5 text-xs">
            <Lock className="h-3.5 w-3.5" />
            Encrypted
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            HIPAA Compliant
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <BadgeCheck className="h-3.5 w-3.5" />
            SOC 2
          </span>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center gap-2 text-xs text-white/30">
          <Link href="https://peptsci.com" className="transition-colors hover:text-white/60">
            peptsci.com
          </Link>
          <span aria-hidden>•</span>
          <span>© {new Date().getFullYear()} PeptSci</span>
        </div>
      </div>
    </div>
  )
}
