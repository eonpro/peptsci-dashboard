import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PEPTSCI Auth',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-4">
        <div className="w-full rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0px_32px_120px_-60px_rgba(91,75,255,0.45)] backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  )
}
