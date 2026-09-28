import type { Metadata } from 'next'
import { TrackingLookupForm } from './TrackingLookupForm'
import { FluidBackground } from '@/components/FluidBackground'

export const metadata: Metadata = {
  title: 'Track your shipment — PeptSci',
  robots: { index: false, follow: false },
}

export default function TrackingHomePage() {
  return (
    <main className="relative isolate min-h-screen bg-[#eef1f8] px-4 py-12 text-[#1a1a2e]">
      <FluidBackground variant="light" />
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-wide text-brand-onyx">PEPTSCI</span>
        </div>
        <div className="rounded-3xl border border-white/70 bg-white/70 p-8 shadow-glass backdrop-blur-2xl backdrop-saturate-150">
          <h1 className="mb-2 text-xl font-semibold">Track your shipment</h1>
          <p className="mb-6 text-sm text-gray-500">
            Enter the tracking number from your shipment confirmation email.
          </p>
          <TrackingLookupForm />
        </div>
      </div>
    </main>
  )
}
