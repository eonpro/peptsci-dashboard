import type { Metadata } from 'next'
import { TrackingLookupForm } from './TrackingLookupForm'

export const metadata: Metadata = {
  title: 'Track your shipment — PeptSci',
  robots: { index: false, follow: false },
}

export default function TrackingHomePage() {
  return (
    <main className="min-h-screen bg-[#F2F0EA] px-4 py-12 text-[#1a1a2e]">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-wide text-brand-onyx">PEPTSCI</span>
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-[0_18px_60px_-30px_rgba(33,60,239,0.35)]">
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
